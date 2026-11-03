import { MailboxError, smtpFailureCategory, type SmtpFailureCategory } from "../mail/errors.js";
import {
  buildEligibilitySnapshot,
  type ContactCandidate,
} from "./campaign-eligibility.js";

export const DEFAULT_TEST_LIST_RECIPIENT_LIMIT = 8;
export const MAX_TEST_LIST_RECIPIENT_LIMIT = 25;
export const TEST_LIST_SEND_CONCURRENCY = 1;

export type FrozenRecipient = {
  contactId: string;
  email: string;
};

export type TestListPlan = {
  requested: number;
  duplicates: number;
  eligible: FrozenRecipient[];
  suppressed: number;
  skipped: number;
};

export type RecipientAttempt = {
  contactId: string;
  email: string;
  outcome: "accepted" | "rejected" | "failed" | "suppressed" | "unknown";
};

export type TestListSummary = {
  listId: string;
  listName: string;
  requested: number;
  eligible: number;
  smtpAccepted: number;
  failed: number;
  suppressed: number;
  skipped: number;
  unknown: number;
  notAttempted: number;
  failureCategory: SmtpFailureCategory | null;
  status: "completed" | "failed";
  message: string | null;
};

/**
 * A row this request inserted may be submitted. An existing row, including one
 * still pending after a crash or a concurrent request, must not be submitted again.
 */
export function claimedSubmissionAction(
  inserted: boolean,
  status: string | null,
): "send" | RecipientAttempt["outcome"] {
  if (inserted) return "send";
  if (status === "accepted" || status === "rejected" || status === "failed" || status === "suppressed" || status === "unknown") {
    return status;
  }
  return "unknown";
}

export function testMessageListRecipientLimit(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.TEST_MESSAGE_MAX_LIST_RECIPIENTS?.trim();
  if (!raw) return DEFAULT_TEST_LIST_RECIPIENT_LIMIT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_TEST_LIST_RECIPIENT_LIMIT) {
    return DEFAULT_TEST_LIST_RECIPIENT_LIMIT;
  }
  return value;
}

export function recipientSubmissionKey(operationKey: string, contactId: string) {
  return `${operationKey}:${contactId}`;
}

export function planTestListRecipients(
  candidates: ContactCandidate[],
  suppressedEmails: Set<string>,
): TestListPlan {
  const snapshot = buildEligibilitySnapshot(candidates, suppressedEmails);
  return {
    requested: snapshot.summary.selectedRaw,
    duplicates: snapshot.summary.duplicates,
    eligible: snapshot.rows
      .filter((row) => row.eligibilityStatus === "eligible" && row.contactId)
      .map((row) => ({ contactId: row.contactId as string, email: row.email })),
    suppressed: snapshot.summary.excludedSuppressed,
    skipped:
      snapshot.summary.excludedInvalid +
      snapshot.summary.excludedUnsubscribed +
      snapshot.summary.excludedPendingConsent +
      snapshot.summary.excludedUnknownConsent,
  };
}

export function isSharedSmtpFailure(error: unknown) {
  return (
    error instanceof MailboxError &&
    (error.code === "SMTP_SEND_FAILED" ||
      error.code === "SMTP_UNCERTAIN" ||
      error.code === "COMPOSE_FAILED")
  );
}

/**
 * One SMTP submission at a time. A shared mailbox failure stops the rest.
 * Contacts that already have a submission row are not sent again.
 */
export async function sendEligibleRecipients(options: {
  recipients: FrozenRecipient[];
  alreadyRecorded: Set<string>;
  sendOne: (recipient: FrozenRecipient) => Promise<RecipientAttempt["outcome"]>;
}): Promise<{
  attempts: RecipientAttempt[];
  sharedFailure: string | null;
  failureCategory: SmtpFailureCategory | null;
}> {
  const attempts: RecipientAttempt[] = [];
  let sharedFailure: string | null = null;
  let failureCategory: SmtpFailureCategory | null = null;

  for (const recipient of options.recipients) {
    if (options.alreadyRecorded.has(recipient.contactId)) continue;
    try {
      const outcome = await options.sendOne(recipient);
      attempts.push({ contactId: recipient.contactId, email: recipient.email, outcome });
    } catch (error) {
      if (isSharedSmtpFailure(error)) {
        sharedFailure = error instanceof Error ? error.message : "The outgoing mail server could not complete the request.";
        failureCategory = smtpFailureCategory(error);
        attempts.push({ contactId: recipient.contactId, email: recipient.email, outcome: "unknown" });
        break;
      }
      attempts.push({ contactId: recipient.contactId, email: recipient.email, outcome: "failed" });
    }
  }

  return { attempts, sharedFailure, failureCategory };
}

export function buildTestListSummary(input: {
  listId: string;
  listName: string;
  requested: number;
  eligible: number;
  suppressed: number;
  skipped: number;
  attempts: RecipientAttempt[];
  priorAccepted?: number;
  priorFailed?: number;
  priorUnknown?: number;
  notAttempted?: number;
  failureCategory?: SmtpFailureCategory | null;
  sharedFailure: string | null;
}): TestListSummary {
  const smtpAccepted =
    (input.priorAccepted ?? 0) + input.attempts.filter((attempt) => attempt.outcome === "accepted").length;
  const failed =
    (input.priorFailed ?? 0) +
    input.attempts.filter((attempt) => attempt.outcome === "rejected" || attempt.outcome === "failed").length;
  const suppressed =
    input.suppressed + input.attempts.filter((attempt) => attempt.outcome === "suppressed").length;
  const unknown =
    (input.priorUnknown ?? 0) + input.attempts.filter((attempt) => attempt.outcome === "unknown").length;
  return {
    listId: input.listId,
    listName: input.listName,
    requested: input.requested,
    eligible: input.eligible,
    smtpAccepted,
    failed,
    suppressed,
    skipped: input.skipped,
    unknown,
    notAttempted: input.notAttempted ?? 0,
    failureCategory: input.failureCategory ?? null,
    status: input.sharedFailure ? "failed" : "completed",
    message: input.sharedFailure,
  };
}

export function testListAuditMetadata(summary: TestListSummary) {
  return {
    listId: summary.listId,
    listName: summary.listName,
    requestedCount: summary.requested,
    eligibleCount: summary.eligible,
    acceptedCount: summary.smtpAccepted,
    failedCount: summary.failed,
    suppressedCount: summary.suppressed,
    skippedCount: summary.skipped,
    unknownCount: summary.unknown,
    notAttemptedCount: summary.notAttempted,
    failureCategory: summary.failureCategory,
  };
}

export function rejectsClientRecipientBatch(body: unknown) {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  return ["recipients", "to", "cc", "bcc"].some((key) => Array.isArray(record[key]));
}
