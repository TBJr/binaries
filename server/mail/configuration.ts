import { z } from "zod";

import { getAppName, getCompanyName } from "../lib/brand.js";
import { MailboxError } from "./errors.js";
import { parseTestRecipientsFromEnv } from "./test-recipients.js";

const RESEND_SMTP_HOST = "smtp.resend.com";

const REQUIRED_KEYS = [
  "SPACEMAIL_IMAP_HOST",
  "SPACEMAIL_IMAP_PORT",
  "SPACEMAIL_IMAP_SECURE",
  "SPACEMAIL_EMAIL",
  "SPACEMAIL_PASSWORD",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
] as const;

const emailField = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.email(),
);

const secureField = z.enum(["true", "false"]).transform((value) => value === "true");

const mailEnvSchema = z.object({
  SPACEMAIL_IMAP_HOST: z.string().trim().toLowerCase().min(1),
  SPACEMAIL_IMAP_PORT: z.coerce.number().int().positive(),
  SPACEMAIL_IMAP_SECURE: secureField,
  SPACEMAIL_EMAIL: emailField,
  SPACEMAIL_PASSWORD: z.string().min(1).refine((value) => !/[\r\n]/.test(value)),
  SPACEMAIL_SENDER_NAME: z.string().optional(),
  RESEND_API_KEY: z.string().trim().min(1).refine((value) => !/[\r\n]/.test(value)),
  RESEND_FROM_EMAIL: emailField,
});

export type MailConfig = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  email: string;
  password: string;
  resendApiKey: string;
  fromEmail: string;
  testRecipients: string[];
  senderName: string;
};

export type MailConfigResult =
  | { ok: true; config: MailConfig }
  | { ok: false; reason: "missing" | "invalid" | "host" | "imap" | "recipients" };

function defaultSenderName(env: NodeJS.ProcessEnv) {
  return getCompanyName(env) || getAppName(env);
}

function cleanSenderName(value: string | undefined, env: NodeJS.ProcessEnv = process.env) {
  const fallback = defaultSenderName(env);
  const cleaned = (value ?? fallback).replace(/[\r\n]+/g, " ").trim().slice(0, 80);
  return cleaned || fallback;
}

function mailboxCredentialsConfigured(env: NodeJS.ProcessEnv) {
  return ["SPACEMAIL_EMAIL", "SPACEMAIL_PASSWORD"].some((key) => (env[key] ?? "").trim().length > 0);
}

export function loadMailConfig(env: NodeJS.ProcessEnv = process.env): MailConfigResult {
  const missing = REQUIRED_KEYS.some((key) => !(env[key] ?? "").trim());
  if (missing) {
    return { ok: false, reason: "missing" };
  }

  const parsed = mailEnvSchema.safeParse(env);
  if (!parsed.success) {
    return { ok: false, reason: "invalid" };
  }

  const recipientsParsed = parseTestRecipientsFromEnv(env);
  if (!recipientsParsed.ok) {
    return { ok: false, reason: "recipients" };
  }

  const data = parsed.data;
  if (data.SPACEMAIL_IMAP_HOST !== "mail.spacemail.com") {
    return { ok: false, reason: "host" };
  }

  if (data.SPACEMAIL_IMAP_PORT !== 993 || !data.SPACEMAIL_IMAP_SECURE) {
    return { ok: false, reason: "imap" };
  }

  return {
    ok: true,
    config: {
      smtpHost: RESEND_SMTP_HOST,
      smtpPort: 465,
      smtpSecure: true,
      imapHost: data.SPACEMAIL_IMAP_HOST,
      imapPort: data.SPACEMAIL_IMAP_PORT,
      imapSecure: data.SPACEMAIL_IMAP_SECURE,
      email: data.SPACEMAIL_EMAIL,
      password: data.SPACEMAIL_PASSWORD,
      resendApiKey: data.RESEND_API_KEY,
      fromEmail: data.RESEND_FROM_EMAIL,
      testRecipients: recipientsParsed.recipients,
      senderName: cleanSenderName(data.SPACEMAIL_SENDER_NAME, env),
    },
  };
}

export { mailboxCredentialsConfigured, parseTestRecipientsFromEnv };

export function toPublicAccount(config: MailConfig) {
  return {
    accountEmail: config.email,
    senderEmail: config.fromEmail,
    testRecipients: config.testRecipients,
    senderName: config.senderName,
  };
}

export function assertAuthorizedParties(
  config: Pick<MailConfig, "fromEmail" | "testRecipients">,
  parties: { from: string; to: string },
) {
  const from = parties.from.trim().toLowerCase();
  const to = parties.to.trim().toLowerCase();
  const allowlist = new Set(config.testRecipients.map((entry) => entry.toLowerCase()));
  if (from !== config.fromEmail || !allowlist.has(to)) {
    throw new MailboxError(
      "Only the configured sender can send, and only to an authorized test recipient.",
      400,
      "UNAUTHORIZED_PARTY",
    );
  }
}

export function assertAllRecipientsAuthorized(
  config: Pick<MailConfig, "fromEmail" | "testRecipients">,
  parties: { from: string; to: string[] },
) {
  const from = parties.from.trim().toLowerCase();
  if (from !== config.fromEmail) {
    throw new MailboxError(
      "Only the configured sender can send, and only to authorized test recipients.",
      400,
      "UNAUTHORIZED_PARTY",
    );
  }
  const allowlist = new Set(config.testRecipients.map((entry) => entry.toLowerCase()));
  for (const recipient of parties.to) {
    const normalized = recipient.trim().toLowerCase();
    if (!allowlist.has(normalized)) {
      throw new MailboxError(
        "Only the configured sender can send, and only to authorized test recipients.",
        400,
        "UNAUTHORIZED_PARTY",
      );
    }
  }
}
