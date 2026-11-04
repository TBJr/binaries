import { createTransport } from "nodemailer";

import type { ServerEnv } from "../env.js";
import { withMailDeadline } from "../mail/deadline.js";
import { sendResendEmail } from "../mail/resend.js";

const MAIL_TIMEOUTS = {
  connectionMs: 5_000,
  greetingMs: 5_000,
  socketMs: 8_000,
  totalMs: 12_000,
} as const;

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

  let host: string;
  let port: number;
  let user: string;
  let pass: string;
  let from: string;
  if (env.AUTH_EMAIL_DELIVERY === "resend") {
    host = "smtp.resend.com";
    port = 465;
    user = "resend";
    pass = env.RESEND_API_KEY ?? "";
    from = env.RESEND_FROM_EMAIL ?? "";
    if (!pass || !from) {
      throw new Error("Resend delivery is selected but RESEND_API_KEY or RESEND_FROM_EMAIL is missing.");
    }
  } else {
    host = env.SMTP_HOST ?? "";
    port = env.SMTP_PORT ?? 0;
    user = env.SMTP_USER ?? "";
    pass = env.SMTP_PASS ?? "";
    from = env.SMTP_FROM ?? user;
    if (!host || !port || !user || !pass || !from) {
      throw new Error("SMTP delivery is selected but the server mail settings are incomplete.");
    }
  }

  if (env.AUTH_EMAIL_DELIVERY === "resend") {
    const result = await sendResendEmail(
      pass,
      {
        from,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
      },
    );
    if (!result.accepted) {
      throw new Error(result.response);
    }
    return { delivered: true };
  }

  const secure = port === 465;
  const transport = createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    connectionTimeout: MAIL_TIMEOUTS.connectionMs,
    greetingTimeout: MAIL_TIMEOUTS.greetingMs,
    socketTimeout: MAIL_TIMEOUTS.socketMs,
    tls: { minVersion: "TLSv1.2", servername: host },
  });
  try {
    await withMailDeadline(
      transport.sendMail({
        from,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        envelope: { from, to: payload.to },
      }),
      MAIL_TIMEOUTS.totalMs,
      () => new Error("The email provider did not confirm whether it accepted the message."),
    );
    return { delivered: true };
  } finally {
    transport.close();
  }
}
