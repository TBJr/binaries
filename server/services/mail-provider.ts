import { eq } from "drizzle-orm";

import type { Database } from "../db/index.js";
import { mailDeliverySettings } from "../db/schema.js";
import type { ServerEnv } from "../env.js";
import { loadEnv } from "../env.js";
import { sendTransactionalEmail, type TransactionalEmailPayload } from "../lib/email.js";
import {
  isOutboundProviderConfigured,
  loadMailConfig,
  type MailConfigResult,
  type OutboundMailProvider,
} from "../mail/configuration.js";

const SETTING_ID = "primary";

export type MailProviderAvailability = Record<OutboundMailProvider, boolean>;

export function mailProviderAvailability(env: ServerEnv): MailProviderAvailability {
  return {
    resend: isOutboundProviderConfigured(env, "resend"),
    spacemail: isOutboundProviderConfigured(env, "spacemail"),
  };
}

async function getStoredMailProvider(db: Database): Promise<OutboundMailProvider | null> {
  const [setting] = await db
    .select({ provider: mailDeliverySettings.provider })
    .from(mailDeliverySettings)
    .where(eq(mailDeliverySettings.id, SETTING_ID))
    .limit(1);
  if (!setting) return null;
  if (setting.provider === "resend" || setting.provider === "spacemail") return setting.provider;
  throw new Error("Stored outbound email provider is invalid.");
}

export async function getMailProvider(db: Database, env: ServerEnv): Promise<OutboundMailProvider> {
  const storedProvider = await getStoredMailProvider(db);
  if (storedProvider) return storedProvider;
  return env.AUTH_EMAIL_DELIVERY === "smtp" ? "spacemail" : "resend";
}

export async function getMailProviderSettings(db: Database, env: ServerEnv) {
  const provider = await getMailProvider(db, env);
  return { provider, availability: mailProviderAvailability(env) };
}

export async function setMailProvider(
  db: Database,
  env: ServerEnv,
  provider: OutboundMailProvider,
  actorId: string,
) {
  if (!mailProviderAvailability(env)[provider]) {
    throw new Error(`${provider === "resend" ? "Resend" : "Spacemail SMTP"} is not fully configured.`);
  }
  const [setting] = await db
    .insert(mailDeliverySettings)
    .values({ id: SETTING_ID, provider, updatedBy: actorId })
    .onConflictDoUpdate({
      target: mailDeliverySettings.id,
      set: { provider, updatedBy: actorId, updatedAt: new Date() },
    })
    .returning({ provider: mailDeliverySettings.provider });
  if (setting?.provider !== provider) {
    throw new Error("The outbound email provider could not be saved.");
  }
  return { provider, availability: mailProviderAvailability(env) };
}

export async function loadActiveMailConfig(
  db: Database,
  env: ServerEnv = loadEnv(),
): Promise<{ provider: OutboundMailProvider; loaded: MailConfigResult }> {
  const provider = await getMailProvider(db, env);
  return { provider, loaded: loadMailConfig(process.env, provider) };
}

export async function sendWithActiveMailProvider(
  db: Database,
  env: ServerEnv,
  payload: TransactionalEmailPayload,
) {
  const storedProvider = await getStoredMailProvider(db);
  if (!storedProvider && (env.AUTH_EMAIL_DELIVERY === "console" || env.AUTH_EMAIL_DELIVERY === "disabled")) {
    return sendTransactionalEmail(env, payload);
  }
  const provider = storedProvider ?? (env.AUTH_EMAIL_DELIVERY === "smtp" ? "spacemail" : "resend");
  return sendTransactionalEmail(
    { ...env, AUTH_EMAIL_DELIVERY: provider === "resend" ? "resend" : "smtp" },
    payload,
  );
}
