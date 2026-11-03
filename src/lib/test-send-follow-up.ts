import { explainApiError } from "./mail-user-errors.js";

/** Existing Sent mailbox route. IMAP-backed; not the History page. */
export const SENT_ROUTE = "/app/sent/";

export type TestSendNoticeTone = "success" | "warning" | "error";

export type TestSendFollowUp = {
  tone: TestSendNoticeTone;
  message: string;
  navigateTo: string | null;
  action: { label: string; to: string } | null;
};

export type SingleTestOutcome = {
  smtpAccepted: boolean;
  status: string;
  sentCopyStatus?: string | null;
};

export type TestListOutcomeCounts = {
  smtpAccepted: number;
  failed: number;
  suppressed: number;
  skipped: number;
  unknown: number;
  notAttempted: number;
  failureCategory: "authentication" | "connection" | "timeout" | "recipient" | "unknown" | null;
  status?: "completed" | "failed";
};

const DUPLICATE_SINGLE = "This request was already submitted. No additional message was sent.";
const DUPLICATE_LIST = "This request was already submitted. No additional messages were sent.";
const UNFINISHED_REQUEST =
  "The request did not finish. Confirm again to retry this same test. If it already went through, the same request will not send a second message.";

function stay(
  tone: TestSendNoticeTone,
  message: string,
  action: TestSendFollowUp["action"] = null,
): TestSendFollowUp {
  return { tone, message, navigateTo: null, action };
}

function goToSent(message: string): TestSendFollowUp {
  return { tone: "success", message, navigateTo: SENT_ROUTE, action: null };
}

function viewSentAction(): TestSendFollowUp["action"] {
  return { label: "View Sent", to: SENT_ROUTE };
}

function skippedCount(summary: TestListOutcomeCounts) {
  return summary.suppressed + summary.skipped;
}

function isFullListSuccess(summary: TestListOutcomeCounts) {
  return (
    summary.smtpAccepted > 0 &&
    summary.failed === 0 &&
    skippedCount(summary) === 0 &&
    summary.unknown === 0 &&
    summary.notAttempted === 0 &&
    summary.failureCategory == null &&
    summary.status !== "failed"
  );
}

function successListMessage(accepted: number) {
  return `${accepted} test message${accepted === 1 ? "" : "s"} accepted by SMTP.`;
}

function partialLead(accepted: number) {
  if (accepted === 1) return "1 message was accepted by SMTP.";
  return `${accepted} messages were accepted by SMTP.`;
}

function failedClause(count: number) {
  if (count <= 0) return null;
  return count === 1 ? "1 failed." : `${count} failed.`;
}

function skippedClause(count: number) {
  if (count <= 0) return null;
  return count === 1 ? "1 recipient was skipped." : `${count} recipients were skipped.`;
}

function unknownClause(count: number) {
  if (count <= 0) return null;
  return count === 1
    ? "1 recipient ended in an unknown state."
    : `${count} recipients ended in an unknown state.`;
}

function notAttemptedClause(count: number) {
  if (count <= 0) return null;
  return count === 1 ? "1 recipient was not attempted." : `${count} recipients were not attempted.`;
}

function categoryMessage(summary: TestListOutcomeCounts) {
  const accepted = summary.smtpAccepted;
  if (summary.failureCategory === "authentication") {
    if (accepted <= 0) return "Binaries.nl could not authenticate with the mail server.";
    const lead =
      accepted === 1
        ? "1 message was accepted before Binaries.nl could not authenticate with the mail server."
        : `${accepted} messages were accepted before Binaries.nl could not authenticate with the mail server.`;
    return `${lead} No further messages were submitted.`;
  }
  if (summary.failureCategory === "connection" || summary.failureCategory === "timeout") {
    if (accepted <= 0) return "Binaries.nl could not connect to the mail server.";
    return accepted === 1
      ? "1 message was accepted before Binaries.nl could not connect to the mail server."
      : `${accepted} messages were accepted before Binaries.nl lost its connection to the mail server.`;
  }
  return null;
}

function countMessage(summary: TestListOutcomeCounts) {
  const accepted = summary.smtpAccepted;
  const skipped = skippedCount(summary);
  const problems = [failedClause(summary.failed), skippedClause(skipped), unknownClause(summary.unknown), notAttemptedClause(summary.notAttempted)].filter(
    (part): part is string => Boolean(part),
  );

  if (accepted <= 0) {
    if (problems.length === 0) return "No messages were accepted by SMTP.";
    if (summary.failed === 0 && skipped === 0 && summary.notAttempted === 0 && summary.unknown > 0) {
      return `${unknownClause(summary.unknown)} No messages were accepted by SMTP.`;
    }
    return ["No messages were accepted by SMTP.", ...problems].join(" ");
  }

  if (problems.length === 0) {
    return `${partialLead(accepted)} The test send did not finish cleanly.`;
  }

  if (problems.length === 1 && summary.failed > 0 && skipped === 0 && summary.unknown === 0 && summary.notAttempted === 0) {
    if (accepted === 1) return `${partialLead(accepted)} ${problems[0]}`;
    const failed = summary.failed === 1 ? "1 failed" : `${summary.failed} failed`;
    return `${accepted} messages were accepted by SMTP, but ${failed}.`;
  }

  if (problems.length === 1 && skipped > 0 && summary.failed === 0 && summary.unknown === 0 && summary.notAttempted === 0) {
    return `${accepted} message${accepted === 1 ? " was" : "s were"} accepted by SMTP. ${problems[0]}`;
  }

  return [partialLead(accepted), ...problems].join(" ");
}

function withDuplicate(message: string, duplicate: boolean) {
  if (!duplicate) return message;
  return `${message} ${DUPLICATE_LIST}`;
}

export function singleTestSendFollowUp(submission: SingleTestOutcome, duplicate: boolean): TestSendFollowUp {
  if (submission.smtpAccepted && submission.status === "accepted") {
    if (duplicate) return goToSent(DUPLICATE_SINGLE);
    const saved =
      submission.sentCopyStatus === "failed" || submission.sentCopyStatus === "folder_missing"
        ? " The sent-folder copy was not saved."
        : "";
    return goToSent(`Test message sent successfully.${saved}`);
  }
  return stay(
    "error",
    submission.status === "rejected"
      ? "The outgoing server rejected the message. It was not accepted for delivery."
      : "The message was not accepted by the outgoing server.",
  );
}

export function testListFollowUp(summary: TestListOutcomeCounts, duplicate: boolean): TestSendFollowUp {
  if (isFullListSuccess(summary)) {
    const message = duplicate ? DUPLICATE_LIST : successListMessage(summary.smtpAccepted);
    return goToSent(message);
  }

  const category = categoryMessage(summary);
  const message = withDuplicate(category ?? countMessage(summary), duplicate);
  const tone: TestSendNoticeTone = summary.smtpAccepted > 0 ? "warning" : "error";
  return stay(tone, message, summary.smtpAccepted > 0 ? viewSentAction() : null);
}

export function testListResultHeading(summary: TestListOutcomeCounts) {
  const followUp = testListFollowUp(summary, false);
  if (followUp.tone === "error") return "Test send stopped";
  if (followUp.tone === "warning") return "Test send incomplete";
  return "Test send complete";
}

export function thrownTestSendFollowUp(
  error: { message?: string; status?: number; code?: string | null } | null,
): TestSendFollowUp {
  if (!error) return stay("error", UNFINISHED_REQUEST);
  return stay("error", explainApiError(error));
}

/**
 * A destination exists only after the API result is known.
 * Pending requests never navigate, even if a later success result is already in hand.
 */
export function destinationAfterTestSend(phase: "pending" | "settled", followUp: TestSendFollowUp | null) {
  if (phase !== "settled") return null;
  return followUp?.navigateTo ?? null;
}

export function canSubmitTestSend(state: { inFlight: boolean; idempotencyKey: string | null }) {
  return !state.inFlight && Boolean(state.idempotencyKey);
}

export function testSendBusyLabel(mode: "single" | "test_list", eligibleCount: number) {
  if (mode === "single") return "Sending…";
  const count = Math.max(0, eligibleCount);
  return `Sending ${count} test message${count === 1 ? "" : "s"}…`;
}

export function sentListRefreshState(token: string) {
  return { refreshSent: token };
}

export function readSentRefreshToken(state: unknown) {
  if (!state || typeof state !== "object" || !("refreshSent" in state)) return "";
  const value = (state as { refreshSent?: unknown }).refreshSent;
  return typeof value === "string" && value.trim() ? value : "";
}
