import { isValidEmail, normalizeEmail } from "../lib/email-normalization.js";

export type ParseTestRecipientsResult =
  | { ok: true; recipients: string[] }
  | { ok: false; reason: "empty" | "invalid" };

/**
 * Reads MAIL_TEST_RECIPIENTS, then the legacy Spacemail-named settings.
 * The generic plural setting takes precedence when non-empty.
 */
export function parseTestRecipientsFromEnv(env: NodeJS.ProcessEnv = process.env): ParseTestRecipientsResult {
  const genericRaw = env.MAIL_TEST_RECIPIENTS?.trim();
  const pluralRaw = env.SPACEMAIL_TEST_RECIPIENTS?.trim();
  const legacyRaw = env.SPACEMAIL_TEST_RECIPIENT?.trim();

  let parts: string[];
  if (genericRaw) {
    parts = genericRaw.split(",");
  } else if (pluralRaw) {
    parts = pluralRaw.split(",");
  } else if (legacyRaw) {
    parts = [legacyRaw];
  } else {
    parts = [];
  }

  const recipients: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (!isValidEmail(trimmed)) {
      return { ok: false, reason: "invalid" };
    }
    const normalized = normalizeEmail(trimmed);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    recipients.push(normalized);
  }

  if (recipients.length === 0) {
    return { ok: false, reason: "empty" };
  }

  return { ok: true, recipients };
}

export function isAuthorizedTestRecipient(
  config: { testRecipients: string[] },
  recipient: string,
): boolean {
  return config.testRecipients.includes(normalizeEmail(recipient));
}
