type TestListResultSummary = {
  smtpAccepted: number;
  failed: number;
  suppressed: number;
  unknown: number;
  failureCategory: "authentication" | "connection" | "timeout" | "recipient" | "unknown" | null;
};

export function explainApiError(error: { message?: string; status?: number; code?: string | null }) {
  const code = error.code ?? "";
  if (code === "database_unavailable" || (error.status === 503 && /database/i.test(error.message ?? ""))) {
    return "Binaries.nl cannot reach the database right now. Your message was not sent. Please try again after the connection is restored.";
  }
  if (code === "smtp_authentication_failed") {
    return "Binaries.nl could not authenticate with the mail server. No further test messages were submitted.";
  }
  if (code === "smtp_unavailable") {
    return "Binaries.nl could not connect to the mail server. Check mail configuration and try again.";
  }
  if (code === "smtp_rejected") {
    return "The mail server rejected the message. It was not accepted for delivery.";
  }
  if (code === "test_list_not_found") return "That test list could not be found.";
  if (code === "test_list_not_enabled") return "Only a list marked as a test list can be used.";
  if (code === "test_list_no_eligible_recipients" || code === "test_list_empty") {
    return "This test list does not currently contain any eligible recipients.";
  }
  if (code === "test_list_too_large") return error.message || "This test list exceeds the maximum allowed size.";
  if (code === "test_send_rate_limited") return error.message || "Test sending is temporarily limited. Wait before trying again.";
  if (error.status === 401) return "Sign in again to continue.";
  if (error.status === 403) return "You do not have permission to send this test message.";
  const message = error.message ?? "";
  if (!message || /postgres:\/\/|password|secret|stack|ETIMEDOUT|ECONNREFUSED/i.test(message)) {
    return "Binaries.nl could not complete the request.";
  }
  return message;
}

export function testListResultCopy(summary: TestListResultSummary) {
  if (summary.failureCategory === "authentication") {
    return `${summary.smtpAccepted} message${summary.smtpAccepted === 1 ? " was" : "s were"} accepted before Binaries.nl could not authenticate with the mail server. No further messages were submitted.`;
  }
  if (summary.failureCategory === "connection" || summary.failureCategory === "timeout") {
    return `${summary.smtpAccepted} message${summary.smtpAccepted === 1 ? " was" : "s were"} accepted before Binaries.nl lost its connection to the mail server.`;
  }
  if (summary.unknown > 0) {
    return `${summary.unknown} recipient${summary.unknown === 1 ? "" : "s"} ended in an unknown state and will not be submitted again for this request.`;
  }
  if (summary.failed > 0 || summary.suppressed > 0) {
    return `${summary.smtpAccepted} message${summary.smtpAccepted === 1 ? " was" : "s were"} accepted by SMTP. ${summary.failed} failed and ${summary.suppressed} ${summary.suppressed === 1 ? "was" : "were"} skipped.`;
  }
  return "Each address was submitted as its own message. SMTP acceptance does not confirm inbox delivery.";
}
