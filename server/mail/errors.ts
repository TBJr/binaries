const REDACTED = "[redacted]";

export class MailboxError extends Error {
  readonly status: 400 | 404 | 502 | 503;
  readonly code: string;

  constructor(message: string, status: 400 | 404 | 502 | 503, code: string) {
    super(message);
    this.name = "MailboxError";
    this.status = status;
    this.code = code;
  }
}

type MailErrorFields = {
  code?: string;
  responseCode?: number;
  response?: unknown;
  command?: string;
  authenticationFailed?: boolean;
  serverResponseCode?: string;
};

export function redactSecrets(value: string, secrets: string[]) {
  let output = value;
  for (const secret of secrets) {
    if (secret.length >= 4) {
      output = output.split(secret).join(REDACTED);
    }
  }
  return output
    .replace(/AUTH(?:ENTICATE)?\s+\S+(?:\s+\S+)?/gi, `AUTH ${REDACTED}`)
    .slice(0, 500);
}

export function safeErrorDetails(error: unknown, secrets: string[]) {
  const extra = (error instanceof Error ? error : new Error("Unknown mail error")) as Error &
    MailErrorFields;
  const response = typeof extra.response === "string" ? extra.response : "";
  return {
    name: extra.name,
    code: extra.code ?? extra.serverResponseCode ?? "UNKNOWN",
    responseCode: extra.responseCode ?? null,
    command: extra.command ?? null,
    authenticationFailed: Boolean(extra.authenticationFailed),
    message: redactSecrets([extra.message, response].filter(Boolean).join(" | "), secrets),
  };
}

function errorFields(error: unknown): MailErrorFields & { message: string } {
  if (!(error instanceof Error)) {
    return { message: "" };
  }
  return error as Error & MailErrorFields;
}

export type SmtpFailureCategory = "authentication" | "connection" | "timeout" | "recipient" | "unknown";

export function smtpFailureCategory(error: unknown): SmtpFailureCategory {
  const fields = errorFields(error);
  const code = (fields.code ?? "").toUpperCase();
  const serverCode = (fields.serverResponseCode ?? "").toUpperCase();
  const message = fields.message.toLowerCase();
  if (
    fields.authenticationFailed === true ||
    code === "EAUTH" ||
    fields.responseCode === 535 ||
    fields.responseCode === 534 ||
    serverCode.includes("AUTHENTICATIONFAILED") ||
    message.includes("credential") ||
    message.includes("authenticate")
  ) {
    return "authentication";
  }
  if (code.includes("TIMEOUT") || code === "ETIMEDOUT" || code === "ETIMEOUT" || code === "CONNECT_TIMEOUT" || code === "GREETING_TIMEOUT") {
    return "timeout";
  }
  if (["ESOCKET", "ECONNECTION", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "SMTP_UNCERTAIN"].includes(code) || message.includes("could not connect")) {
    return "connection";
  }
  if (code === "EENVELOPE" || (fields.responseCode ?? 0) >= 500) return "recipient";
  return "unknown";
}

export function publicSmtpCode(error: unknown) {
  const category = smtpFailureCategory(error);
  if (category === "authentication") return "smtp_authentication_failed";
  if (category === "recipient") return "smtp_rejected";
  return "smtp_unavailable";
}

export function friendlyMailError(error: unknown, protocol: "smtp" | "imap") {
  const fields = errorFields(error);
  const code = (fields.code ?? "").toUpperCase();
  const serverCode = (fields.serverResponseCode ?? "").toUpperCase();
  const authFailed =
    fields.authenticationFailed === true ||
    code === "EAUTH" ||
    fields.responseCode === 535 ||
    fields.responseCode === 534 ||
    serverCode.includes("AUTHENTICATIONFAILED") ||
    serverCode === "AUTHENTICATIONFAILED";

  if (authFailed) {
    return protocol === "smtp"
      ? "Outgoing mail server rejected the mailbox credentials."
      : "Incoming mail server rejected the mailbox credentials.";
  }

  const connectionCodes = new Set([
    "ETIMEDOUT",
    "ETIMEOUT",
    "CONNECT_TIMEOUT",
    "GREETING_TIMEOUT",
    "ESOCKET",
    "ECONNECTION",
    "ECONNREFUSED",
    "ECONNRESET",
    "ENOTFOUND",
    "EAI_AGAIN",
  ]);
  if (connectionCodes.has(code) || (fields.responseCode === undefined && code.includes("TIMEOUT"))) {
    return protocol === "smtp"
      ? "Could not connect to the outgoing mail server."
      : "Could not connect to the incoming mail server.";
  }

  if (protocol === "smtp" && (code === "EENVELOPE" || (fields.responseCode ?? 0) >= 500)) {
    return "The outgoing server rejected the message.";
  }

  return protocol === "smtp"
    ? "The outgoing mail server could not complete the request."
    : "The incoming mail server could not complete the request.";
}
