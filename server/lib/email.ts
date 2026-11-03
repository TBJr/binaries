import { createTransport } from "nodemailer";

import type { ServerEnv } from "../env.js";

export type TransactionalEmailPayload = {
  to: string;
  subject: string;
  text: string;
};

/** Redact verification, reset, and invitation tokens from dev console previews. */
export function redactAuthEmailText(text: string): string {
  return text
    .replace(/token=[^&\s]+/gi, "token=[redacted]")
    .replace(/\/reset-password\/[^\s]+/gi, "/reset-password/[redacted]")
    .replace(/\/invite\/\?token=[^\s]+/gi, "/invite/?token=[redacted]");
}

export type EmailDeliveryResult =
  | { delivered: true }
  | { delivered: false; devOnly: true; preview?: string };

export async function sendTransactionalEmail(
  env: ServerEnv,
  payload: TransactionalEmailPayload,
): Promise<EmailDeliveryResult> {
  if (env.AUTH_EMAIL_DELIVERY === "disabled") {
    throw new Error("Email delivery is not configured on this server.");
  }

  if (env.AUTH_EMAIL_DELIVERY === "console") {
    if (env.NODE_ENV === "production") {
      console.warn(
        "[auth-email] AUTH_EMAIL_DELIVERY=console in production — messages are not sent to recipients.",
      );
    }
    const preview = redactAuthEmailText(payload.text);
    console.info("[auth-email]", {
      to: payload.to,
      subject: payload.subject,
      text: preview,
    });
    return { delivered: false, devOnly: true, preview };
  }

  const host = env.SMTP_HOST;
  const port = env.SMTP_PORT;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const from = env.SMTP_FROM ?? env.SMTP_USER;
  if (!host || !port || !user || !pass || !from) {
    throw new Error("SMTP delivery is selected but the server mail settings are incomplete.");
  }

  const secure = port === 465;
  const transport = createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2", servername: host },
  });
  try {
    await transport.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      envelope: { from, to: payload.to },
    });
    return { delivered: true };
  } finally {
    transport.close();
  }
}
