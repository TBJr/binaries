import { MailboxError } from "./errors.js";

const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_DOMAINS_URL = "https://api.resend.com/domains";
const RESEND_TIMEOUT_MS = 8_000;

export type ResendEmailPayload = {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
};

export type ResendEmailResult =
  | { accepted: true; id: string }
  | { accepted: false; response: string };

export async function sendResendEmail(
  apiKey: string,
  payload: ResendEmailPayload,
  idempotencyKey?: string,
): Promise<ResendEmailResult> {
  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[mail] Resend API request failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    throw new MailboxError(
      "Resend did not confirm whether it accepted the message. Check the provider's delivery logs before retrying.",
      502,
      "SMTP_UNCERTAIN",
    );
  }

  if (!response.ok) {
    await response.body?.cancel();
    if (response.status >= 500) {
      throw new MailboxError(
        "Resend did not confirm whether it accepted the message. Check the provider's delivery logs before retrying.",
        502,
        "SMTP_UNCERTAIN",
      );
    }
    return {
      accepted: false,
      response: `Resend rejected the message (HTTP ${response.status}).`,
    };
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new MailboxError(
      "Resend did not confirm whether it accepted the message. Check the provider's delivery logs before retrying.",
      502,
      "SMTP_UNCERTAIN",
    );
  }

  if (
    !result ||
    typeof result !== "object" ||
    !("id" in result) ||
    typeof result.id !== "string" ||
    !result.id
  ) {
    throw new MailboxError(
      "Resend did not confirm whether it accepted the message. Check the provider's delivery logs before retrying.",
      502,
      "SMTP_UNCERTAIN",
    );
  }

  return { accepted: true, id: result.id };
}

export async function verifyResendConnection(apiKey: string) {
  let response: Response;
  try {
    response = await fetch(RESEND_DOMAINS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[mail] Resend API verification failed", {
      name: error instanceof Error ? error.name : "Error",
    });
    throw new MailboxError("Could not connect to Resend.", 502, "SMTP_VERIFY_FAILED");
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new MailboxError(
      response.status === 401 || response.status === 403
        ? "Resend rejected the API key."
        : "Resend could not verify the connection.",
      502,
      "SMTP_VERIFY_FAILED",
    );
  }
  await response.body?.cancel();
}
