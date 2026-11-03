import { and, eq, gte, inArray } from "drizzle-orm";

import type { Database } from "../db/index.js";
import {
  contactListMembers,
  contactLists,
  contacts,
  emailSuppressions,
  mailSubmissions,
  testMessageOperations,
} from "../db/schema.js";
import { normalizeEmail } from "../lib/email-normalization.js";
import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import { resolveRecipientOwnerId } from "../lib/org-workspace.js";
import { MailboxError } from "../mail/errors.js";
import { saveSentCopy } from "../mail/imap.js";
import { withPgAdvisoryLock, type MailLock } from "../mail/lock.js";
import { loadMailConfig } from "../mail/configuration.js";
import { TEST_SEND_LIMITS, assessTestSendRateLimit } from "../mail/rate-limit.js";
import { submitSingleRecipientMessage } from "../mail/smtp.js";
import { recordAuditEvent } from "./audit-log.js";
import { getContactListById } from "./contact-lists.js";
import {
  expireStalePendingSubmissions,
  findSubmissionByKey,
  insertPendingSubmission,
  listRecentSubmissionTimes,
  updateSubmission,
} from "./mail-records.js";
import { prepareTestMessageHtml } from "./mail-test-send.js";
import {
  buildTestListSummary,
  claimedSubmissionAction,
  planTestListRecipients,
  recipientSubmissionKey,
  sendEligibleRecipients,
  testListAuditMetadata,
  testMessageListRecipientLimit,
  type FrozenRecipient,
  type RecipientAttempt,
  type TestListSummary,
} from "./test-list-plan.js";
import type { SubscriptionStatus } from "../validation/contacts.js";

export type TestListSendInput = {
  subject: string;
  text: string;
  html?: string;
  idempotencyKey: string;
  testListId: string;
};

export type TestListAuditContext = {
  actorEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type TestListSendOutcome =
  | { kind: "not_configured" }
  | { kind: "not_found" }
  | { kind: "not_test_list" }
  | { kind: "none_eligible"; requested: number; suppressed: number; skipped: number }
  | { kind: "over_limit"; eligible: number; limit: number }
  | { kind: "rate_limited"; message: string }
  | { kind: "duplicate"; summary: TestListSummary; results: RecipientAttempt[] }
  | { kind: "completed"; summary: TestListSummary; results: RecipientAttempt[] }
  | { kind: "failed"; summary: TestListSummary; results: RecipientAttempt[] };

export type TestListOption = {
  id: string;
  name: string;
  memberCount: number;
  eligibleCount: number;
};

function summaryFromOperation(row: typeof testMessageOperations.$inferSelect): TestListSummary {
  return {
    listId: row.listId ?? "",
    listName: row.listName,
    requested: row.requestedCount,
    eligible: row.eligibleCount,
    smtpAccepted: row.acceptedCount,
    failed: row.failedCount,
    suppressed: row.suppressedCount,
    skipped: row.skippedCount,
    unknown: row.unknownCount,
    notAttempted: row.notAttemptedCount,
    failureCategory:
      row.failureCategory === "authentication" ||
      row.failureCategory === "connection" ||
      row.failureCategory === "timeout" ||
      row.failureCategory === "recipient" ||
      row.failureCategory === "unknown"
        ? row.failureCategory
        : null,
    status: row.status === "failed" ? "failed" : "completed",
    message: row.errorMessage,
  };
}

async function findOperation(db: Database, idempotencyKey: string) {
  const [row] = await db
    .select()
    .from(testMessageOperations)
    .where(eq(testMessageOperations.idempotencyKey, idempotencyKey))
    .limit(1);
  return row ?? null;
}

async function childResults(db: Database, operationId: string): Promise<RecipientAttempt[]> {
  const rows = await db
    .select({
      contactId: mailSubmissions.contactId,
      email: mailSubmissions.toAddress,
      status: mailSubmissions.status,
    })
    .from(mailSubmissions)
    .where(eq(mailSubmissions.operationId, operationId));
  return rows.map((row) => ({
    contactId: row.contactId ?? "",
    email: row.email,
    outcome:
      row.status === "accepted"
        ? "accepted"
        : row.status === "rejected"
          ? "rejected"
          : row.status === "suppressed"
            ? "suppressed"
            : row.status === "failed"
              ? "failed"
              : "unknown",
  }));
}

async function suppressedEmails(db: Database, userId: string, emails: string[]) {
  if (emails.length === 0) return new Set<string>();
  const rows = await db
    .select({ email: emailSuppressions.email })
    .from(emailSuppressions)
    .where(and(eq(emailSuppressions.userId, userId), inArray(emailSuppressions.email, emails)));
  return new Set(rows.map((row) => normalizeEmail(row.email)));
}

async function loadOwnedTestList(db: Database, userId: string, listId: string) {
  const list = await getContactListById(db, userId, listId);
  if (!list) return { error: "not_found" as const };
  if (!list.isTestList) return { error: "not_test_list" as const };
  const rows = await db
    .select({
      contactId: contacts.id,
      email: contacts.email,
      subscriptionStatus: contacts.subscriptionStatus,
    })
    .from(contactListMembers)
    .innerJoin(contacts, eq(contacts.id, contactListMembers.contactId))
    .where(and(eq(contactListMembers.listId, listId), eq(contacts.userId, userId)));
  const candidates = rows.map((row) => ({
    contactId: row.contactId,
    email: row.email,
    subscriptionStatus: row.subscriptionStatus as SubscriptionStatus,
  }));
  const suppressed = await suppressedEmails(
    db,
    userId,
    candidates.map((candidate) => normalizeEmail(candidate.email)),
  );
  return { list, plan: planTestListRecipients(candidates, suppressed), ownerId: userId };
}

/** Owners to search for designated test lists for this actor (shared pool + own id). */
export function testListOwnerIdsForActor(actor: { id: string; role?: string | null }): string[] {
  const primary = resolveRecipientOwnerId(actor);
  if (primary === actor.id) return [actor.id];
  return [primary, actor.id];
}

async function resolveOwnedTestList(
  db: Database,
  actor: { id: string; role?: string | null },
  listId: string,
) {
  let sawNotTestList = false;
  for (const ownerId of testListOwnerIdsForActor(actor)) {
    const loaded = await loadOwnedTestList(db, ownerId, listId);
    if (!("error" in loaded)) return loaded;
    if (loaded.error === "not_test_list") sawNotTestList = true;
  }
  return { error: sawNotTestList ? ("not_test_list" as const) : ("not_found" as const) };
}

export async function listDesignatedTestLists(
  db: Database,
  actor: { id: string; role?: string | null },
): Promise<TestListOption[]> {
  const ownerIds = testListOwnerIdsForActor(actor);
  const seen = new Set<string>();
  const options: TestListOption[] = [];

  for (const ownerId of ownerIds) {
    const testLists = await db
      .select()
      .from(contactLists)
      .where(and(eq(contactLists.userId, ownerId), eq(contactLists.isTestList, true)));

    for (const list of testLists) {
      if (seen.has(list.id)) continue;
      const loaded = await loadOwnedTestList(db, ownerId, list.id);
      if ("error" in loaded) continue;
      seen.add(list.id);
      options.push({
        id: list.id,
        name: list.name,
        memberCount: loaded.plan.requested,
        eligibleCount: loaded.plan.eligible.length,
      });
    }
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}

async function emailSuppressedNow(db: Database, userId: string, email: string) {
  const normalized = normalizeEmail(email);
  const [row] = await db
    .select({ id: emailSuppressions.id })
    .from(emailSuppressions)
    .where(and(eq(emailSuppressions.userId, userId), eq(emailSuppressions.email, normalized)))
    .limit(1);
  return Boolean(row);
}

async function recentActivity(db: Database, since: Date) {
  const singles = await listRecentSubmissionTimes(db, since);
  const operations = await db
    .select({ createdAt: testMessageOperations.createdAt })
    .from(testMessageOperations)
    .where(gte(testMessageOperations.createdAt, since));
  return [...singles, ...operations];
}

export async function sendDesignatedTestList(
  db: Database,
  userId: string,
  input: TestListSendInput,
  audit: TestListAuditContext = {},
  actorRole?: string | null,
): Promise<TestListSendOutcome> {
  const loadedConfig = loadMailConfig();
  if (!loadedConfig.ok) {
    console.error("[mail] configuration unavailable", loadedConfig.reason);
    return { kind: "not_configured" };
  }
  const config = loadedConfig.config;
  const limit = testMessageListRecipientLimit();

  return withPgAdvisoryLock(db, `mail-test-list:${input.idempotencyKey}`, async () => {
    await expireStalePendingSubmissions(db);
    const existing = await findOperation(db, input.idempotencyKey);
    if (existing && existing.userId !== userId) {
      throw new MailboxError("This test request cannot be reused.", 400, "IDEMPOTENCY_CONFLICT");
    }
    if (existing && existing.status !== "pending") {
      return {
        kind: "duplicate",
        summary: summaryFromOperation(existing),
        results: await childResults(db, existing.id),
      };
    }

    let operation = existing;
    let planRequested = existing?.requestedCount ?? 0;
    let planSuppressed = existing?.suppressedCount ?? 0;
    let planSkipped = existing?.skippedCount ?? 0;
    let snapshot: FrozenRecipient[] = existing?.recipientSnapshot ?? [];
    let listOwnerId = resolveRecipientOwnerId({ id: userId, role: actorRole });

    if (!operation) {
      const loaded = await resolveOwnedTestList(db, { id: userId, role: actorRole }, input.testListId);
      if ("error" in loaded) {
        return loaded.error === "not_found" ? { kind: "not_found" } : { kind: "not_test_list" };
      }
      listOwnerId = loaded.ownerId;
      const eligibleCount = loaded.plan.eligible.length;
      if (eligibleCount > limit) {
        return { kind: "over_limit", eligible: eligibleCount, limit };
      }
      if (eligibleCount === 0) {
        return {
          kind: "none_eligible",
          requested: loaded.plan.requested,
          suppressed: loaded.plan.suppressed,
          skipped: loaded.plan.skipped,
        };
      }
      const now = new Date();
      const activity = await recentActivity(db, new Date(now.getTime() - TEST_SEND_LIMITS.hourMs));
      const gate = assessTestSendRateLimit(activity, now);
      if (!gate.allowed) return { kind: "rate_limited", message: gate.message };

      const [created] = await db
        .insert(testMessageOperations)
        .values({
          id: crypto.randomUUID(),
          userId,
          idempotencyKey: input.idempotencyKey,
          listId: loaded.list.id,
          listName: loaded.list.name,
          subject: input.subject,
          status: "pending",
          requestedCount: loaded.plan.requested,
          eligibleCount: eligibleCount,
          suppressedCount: loaded.plan.suppressed,
          skippedCount: loaded.plan.skipped,
          recipientSnapshot: loaded.plan.eligible,
        })
        .onConflictDoNothing({ target: testMessageOperations.idempotencyKey })
        .returning();
      operation = created ?? (await findOperation(db, input.idempotencyKey));
      if (!operation) {
        throw new MailboxError("The test send could not be recorded.", 503, "TEST_OPERATION_FAILED");
      }
      if (operation.status !== "pending") {
        return {
          kind: "duplicate",
          summary: summaryFromOperation(operation),
          results: await childResults(db, operation.id),
        };
      }
      planRequested = operation.requestedCount;
      planSuppressed = operation.suppressedCount;
      planSkipped = operation.skippedCount;
      snapshot = operation.recipientSnapshot;
      await recordAuditEvent(db, {
        action: AUDIT_ACTIONS.testMessageListSendRequested,
        category: "EMAIL",
        result: "success",
        actorUserId: userId,
        actorEmail: audit.actorEmail,
        resourceType: "test_message_operation",
        resourceId: operation.id,
        requestContext: { ipAddress: audit.ipAddress, userAgent: audit.userAgent },
        metadata: testListAuditMetadata({
          listId: operation.listId ?? input.testListId,
          listName: operation.listName,
          requested: planRequested,
          eligible: snapshot.length,
          smtpAccepted: 0,
          failed: 0,
          suppressed: planSuppressed,
          skipped: planSkipped,
          unknown: 0,
          notAttempted: 0,
          failureCategory: null,
          status: "completed",
          message: null,
        }),
      }).catch((error) => {
        console.error("[audit] test list request", error instanceof Error ? error.name : "error");
      });
    } else {
      const owned = await resolveOwnedTestList(
        db,
        { id: userId, role: actorRole },
        operation.listId ?? input.testListId,
      );
      if (!("error" in owned)) listOwnerId = owned.ownerId;
    }

    const recorded = await db
      .select({
        contactId: mailSubmissions.contactId,
        status: mailSubmissions.status,
      })
      .from(mailSubmissions)
      .where(eq(mailSubmissions.operationId, operation.id));
    const alreadyRecorded = new Set(
      recorded.map((row) => row.contactId).filter((id): id is string => Boolean(id)),
    );
    const priorAccepted = recorded.filter((row) => row.status === "accepted").length;
    const priorFailed = recorded.filter((row) => row.status === "rejected" || row.status === "failed").length;
    const priorSuppressed = recorded.filter((row) => row.status === "suppressed").length;
    const priorUnknown = recorded.filter((row) => row.status === "pending" || row.status === "unknown").length;

    const html = prepareTestMessageHtml(input);
    const sentCopyLock = (messageId: string): MailLock => (task) =>
      withPgAdvisoryLock(db, `sent-copy:${messageId}`, task);

    const { attempts, sharedFailure, failureCategory } = await sendEligibleRecipients({
      recipients: snapshot,
      alreadyRecorded,
      sendOne: async (recipient) => {
        const submissionKey = recipientSubmissionKey(input.idempotencyKey, recipient.contactId);
        const inserted = await insertPendingSubmission(db, {
          userId,
          idempotencyKey: submissionKey,
          fromAddress: config.email,
          toAddress: recipient.email,
          subject: input.subject,
          operationId: operation.id,
          contactId: recipient.contactId,
        });
        const submission = inserted ?? (await findSubmissionByKey(db, submissionKey));
        const claim = claimedSubmissionAction(Boolean(inserted), submission?.status ?? null);
        if (claim !== "send") return claim;
        if (!submission) return "unknown";

        if (await emailSuppressedNow(db, listOwnerId, recipient.email)) {
          await updateSubmission(db, submission.id, {
            status: "suppressed",
            sentCopyStatus: "not_attempted",
            errorMessage: "Suppressed",
          });
          return "suppressed";
        }

        let submitted;
        try {
          submitted = await submitSingleRecipientMessage(config, {
            subject: input.subject,
            text: input.text,
            html,
            to: recipient.email,
          });
        } catch (error) {
          await updateSubmission(db, submission.id, {
            status: "unknown",
            sentCopyStatus: "not_attempted",
            errorMessage: "The outgoing server did not confirm whether it accepted the message.",
          });
          throw error;
        }
        if (!submitted.accepted) {
          await updateSubmission(db, submission.id, {
            status: "rejected",
            messageId: submitted.messageId,
            smtpResponse: submitted.response,
            acceptedRecipients: submitted.acceptedRecipients,
            rejectedRecipients: submitted.rejectedRecipients,
            sentCopyStatus: "not_attempted",
            errorMessage: "The outgoing server rejected the message.",
          });
          return "rejected";
        }
        let sentCopyStatus: string | null;
        let sentCopyError: string | null;
        try {
          const sentCopy = await saveSentCopy(
            config,
            submitted.raw,
            submitted.messageId,
            sentCopyLock(submitted.messageId),
          );
          sentCopyStatus = sentCopy.status;
          sentCopyError = sentCopy.errorMessage;
        } catch (error) {
          sentCopyStatus = "failed";
          sentCopyError = error instanceof MailboxError ? error.message : "A sent-folder copy could not be saved.";
        }
        await updateSubmission(db, submission.id, {
          status: "accepted",
          messageId: submitted.messageId,
          smtpResponse: submitted.response,
          acceptedRecipients: submitted.acceptedRecipients,
          rejectedRecipients: submitted.rejectedRecipients,
          sentCopyStatus,
          sentCopyError,
          errorMessage: sentCopyError,
        });
        return "accepted";
      },
    });

    const summary = buildTestListSummary({
      listId: operation.listId ?? input.testListId,
      listName: operation.listName,
      requested: planRequested,
      eligible: snapshot.length,
      suppressed: planSuppressed + priorSuppressed,
      skipped: planSkipped,
      attempts,
      priorAccepted,
      priorFailed,
      priorUnknown,
      notAttempted: Math.max(0, snapshot.length - alreadyRecorded.size - attempts.length),
      failureCategory,
      sharedFailure,
    });
    await db
      .update(testMessageOperations)
      .set({
        status: summary.status === "failed" ? "failed" : "completed",
        acceptedCount: summary.smtpAccepted,
        failedCount: summary.failed,
        suppressedCount: summary.suppressed,
        unknownCount: summary.unknown,
        notAttemptedCount: summary.notAttempted,
        failureCategory: summary.failureCategory,
        errorMessage: summary.message,
        updatedAt: new Date(),
      })
      .where(eq(testMessageOperations.id, operation.id));

    console.info(
      `[mail] test list ${operation.listId ?? "unset"} eligible=${summary.eligible} accepted=${summary.smtpAccepted} failed=${summary.failed} suppressed=${summary.suppressed}`,
    );
    await recordAuditEvent(db, {
      action:
        summary.status === "failed"
          ? AUDIT_ACTIONS.testMessageListSendFailed
          : AUDIT_ACTIONS.testMessageListSendCompleted,
      category: "EMAIL",
      result: summary.status === "failed" ? "failure" : "success",
      actorUserId: userId,
      actorEmail: audit.actorEmail,
      resourceType: "test_message_operation",
      resourceId: operation.id,
      requestContext: { ipAddress: audit.ipAddress, userAgent: audit.userAgent },
      metadata: testListAuditMetadata(summary),
    }).catch((error) => {
      console.error("[audit] test list result", error instanceof Error ? error.name : "error");
    });

    const results = await childResults(db, operation.id);
    return summary.status === "failed"
      ? { kind: "failed", summary, results }
      : { kind: "completed", summary, results };
  });
}
