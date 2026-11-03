const SENSITIVE_METADATA_KEYS = new Set([
  "password",
  "currentPassword",
  "newPassword",
  "token",
  "secret",
  "backupCodes",
  "backupCode",
  "totp",
  "otp",
  "smtpPass",
  "smtp_pass",
  "SPACEMAIL_PASSWORD",
  "apiKey",
  "authorization",
  "cookie",
  "session",
  "idempotencyKey",
  "contentJson",
  "bodyHtml",
  "bodyText",
  "html",
  "text",
  "recipients",
  "recipientSnapshot",
  "recipientEmails",
  "raw",
]);

export type AuditResult = "success" | "failure";

export function sanitizeAuditMetadata(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_METADATA_KEYS.has(key)) continue;
    if (typeof value === "string" && /token=|password|secret|otp/i.test(value)) continue;
    out[key] = value;
  }
  return out;
}

export function auditEventTypeForAction(action: string): string {
  if (action.includes("invitation")) return "invitation";
  if (action.includes("role")) return "role";
  if (action.includes("password")) return "password";
  if (action.includes("two_factor") || action.includes("2fa")) return "two_factor";
  if (action.includes("login") || action.includes("sign_in") || action.includes("sign_out")) {
    return "authentication";
  }
  if (action === "page_viewed" || action === "api_mutation" || action.startsWith("page_")) {
    return "activity";
  }
  if (action.startsWith("campaign_")) return "campaign";
  if (action.includes("mail") || action.includes("mailbox")) return "mailbox";
  return "administration";
}
