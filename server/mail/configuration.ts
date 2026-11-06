import { z } from "zod";

import { getAppName, getCompanyName } from "../lib/brand.js";
import { MailboxError } from "./errors.js";
import { parseTestRecipientsFromEnv } from "./test-recipients.js";

const RESEND_SMTP_HOST = "smtp.resend.com";

const emailField = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined),
  z.email().optional(),
);

const secureField = z.enum(["true", "false"]).transform((value) => value === "true");

const imapEnvSchema = z.object({
  SPACEMAIL_IMAP_HOST: z.string().trim().toLowerCase().optional(),
  SPACEMAIL_IMAP_PORT: z.preprocess((value) => (value === "" ? undefined : value), z.coerce.number().int().positive().optional()),
  SPACEMAIL_IMAP_SECURE: z.preprocess((value) => (value === "" ? undefined : value), secureField.optional()),
  SPACEMAIL_EMAIL: emailField,
  SPACEMAIL_PASSWORD: z.string().optional(),
  SPACEMAIL_SENDER_NAME: z.string().optional(),
});

const resendEnvSchema = z.object({
  RESEND_API_KEY: z.string().trim().min(1).refine((value) => !/[\r\n]/.test(value)),
  RESEND_FROM_EMAIL: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z.email(),
  ),
});

const smtpEnvSchema = z.object({
  SMTP_HOST: z.string().trim().min(1),
  SMTP_PORT: z.preprocess((value) => (value === "" ? undefined : value), z.coerce.number().int().positive()),
  SMTP_USER: z.string().trim().min(1),
  SMTP_PASS: z.string().min(1).refine((value) => !/[\r\n]/.test(value)),
  SMTP_FROM: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z.email(),
  ),
});

export type OutboundMailProvider = "resend" | "spacemail";

export type MailConfig = {
  provider: OutboundMailProvider;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapConfigured: boolean;
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

export function isOutboundProviderConfigured(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
  provider: OutboundMailProvider,
) {
  return provider === "resend"
    ? resendEnvSchema.safeParse(env).success
    : smtpEnvSchema.safeParse(env).success;
}

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

export function loadMailConfig(
  env: NodeJS.ProcessEnv = process.env,
  provider: OutboundMailProvider = env.AUTH_EMAIL_DELIVERY === "smtp" ? "spacemail" : "resend",
): MailConfigResult {
  const recipientsParsed = parseTestRecipientsFromEnv(env);
  if (!recipientsParsed.ok && recipientsParsed.reason !== "empty") {
    return { ok: false, reason: "recipients" };
  }
  const testRecipients = recipientsParsed.ok ? recipientsParsed.recipients : [];

  const parsedSender = imapEnvSchema.safeParse(env);
  const senderName = parsedSender.success
    ? cleanSenderName(parsedSender.data.SPACEMAIL_SENDER_NAME, env)
    : cleanSenderName(undefined, env);
  let smtpHost: string;
  let smtpPort: number;
  let smtpUser: string;
  let smtpPassword: string;
  let fromEmail: string;
  if (provider === "resend") {
    if (!env.RESEND_API_KEY?.trim() || !env.RESEND_FROM_EMAIL?.trim()) {
      return { ok: false, reason: "missing" };
    }
    const parsed = resendEnvSchema.safeParse(env);
    if (!parsed.success) {
      return { ok: false, reason: "invalid" };
    }
    smtpHost = RESEND_SMTP_HOST;
    smtpPort = 465;
    smtpUser = "resend";
    smtpPassword = parsed.data.RESEND_API_KEY;
    fromEmail = parsed.data.RESEND_FROM_EMAIL;
  } else {
    if (
      !env.SMTP_HOST?.trim() ||
      !env.SMTP_PORT?.trim() ||
      !env.SMTP_USER?.trim() ||
      !env.SMTP_PASS?.trim() ||
      !env.SMTP_FROM?.trim()
    ) {
      return { ok: false, reason: "missing" };
    }
    const parsed = smtpEnvSchema.safeParse(env);
    if (!parsed.success) {
      return { ok: false, reason: "invalid" };
    }
    smtpHost = parsed.data.SMTP_HOST;
    smtpPort = parsed.data.SMTP_PORT;
    smtpUser = parsed.data.SMTP_USER;
    smtpPassword = parsed.data.SMTP_PASS;
    fromEmail = parsed.data.SMTP_FROM;
  }

  const imapConfigured = Boolean(
    parsedSender.success &&
      mailboxCredentialsConfigured(env) &&
      parsedSender.data.SPACEMAIL_EMAIL &&
      parsedSender.data.SPACEMAIL_PASSWORD &&
      parsedSender.data.SPACEMAIL_IMAP_HOST === "mail.spacemail.com" &&
      parsedSender.data.SPACEMAIL_IMAP_PORT === 993 &&
      parsedSender.data.SPACEMAIL_IMAP_SECURE === true,
  );

  const imapData = parsedSender.success ? parsedSender.data : {};
  return {
    ok: true,
    config: {
      provider,
      smtpHost,
      smtpPort,
      smtpSecure: smtpPort === 465,
      smtpUser,
      smtpPassword,
      imapHost: imapData.SPACEMAIL_IMAP_HOST ?? "mail.spacemail.com",
      imapPort: imapData.SPACEMAIL_IMAP_PORT ?? 993,
      imapSecure: imapData.SPACEMAIL_IMAP_SECURE ?? true,
      imapConfigured,
      email: imapData.SPACEMAIL_EMAIL ?? fromEmail,
      password: imapData.SPACEMAIL_PASSWORD ?? "",
      resendApiKey: provider === "resend" ? smtpPassword : "",
      fromEmail,
      testRecipients,
      senderName,
    },
  };
}

export { mailboxCredentialsConfigured, parseTestRecipientsFromEnv };

export function toPublicAccount(config: MailConfig) {
  return {
    accountEmail: config.imapConfigured ? config.email : null,
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
