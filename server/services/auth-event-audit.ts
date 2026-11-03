import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import type { Database } from "../db/index.js";
import { clientIpFromHeaders, userAgentFromHeaders } from "../lib/request-context.js";
import { getSessionUser } from "../lib/session.js";
import { recordAuditEvent } from "./audit-log.js";

const SUCCESS_RULES: Array<{ suffix: string; action: string; eventType: string }> = [
  { suffix: "/sign-in/email", action: AUDIT_ACTIONS.authSignIn, eventType: "authentication" },
  { suffix: "/sign-out", action: AUDIT_ACTIONS.authSignOut, eventType: "authentication" },
  { suffix: "/two-factor/enable", action: AUDIT_ACTIONS.twoFactorEnabled, eventType: "two_factor" },
  { suffix: "/two-factor/disable", action: AUDIT_ACTIONS.twoFactorDisabled, eventType: "two_factor" },
  { suffix: "/two-factor/generate-backup-codes", action: AUDIT_ACTIONS.twoFactorBackupCodesRegenerated, eventType: "two_factor" },
];

const FAILURE_RULES: Array<{ suffix: string; action: string; eventType: string }> = [
  { suffix: "/sign-in/email", action: AUDIT_ACTIONS.authSignInFailed, eventType: "authentication" },
  { suffix: "/two-factor/verify", action: AUDIT_ACTIONS.twoFactorVerifyFailed, eventType: "two_factor" },
];

function matchRule<T extends { suffix: string }>(path: string, rules: T[]) {
  const normalized = path.split("?")[0] ?? path;
  return rules.find((entry) => normalized.endsWith(entry.suffix));
}

export async function recordAuthHandlerAudit(input: {
  db: Database;
  path: string;
  method: string;
  status: number;
  headers: Headers;
}) {
  if (input.method !== "POST") return;
  const normalized = input.path.split("?")[0] ?? input.path;
  const ctx = {
    ipAddress: clientIpFromHeaders(input.headers),
    userAgent: userAgentFromHeaders(input.headers),
  };

  if (input.status >= 200 && input.status < 300) {
    const rule = matchRule(normalized, SUCCESS_RULES);
    if (!rule) return;
    const account = await getSessionUser(input.headers);
    if (!account) return;
    await recordAuditEvent(input.db, {
      action: rule.action,
      eventType: rule.eventType,
      category: "AUTHENTICATION",
      result: "success",
      actorUserId: account.id,
      targetUserId: account.id,
      actorEmail: account.email,
      requestContext: ctx,
    });
    return;
  }

  if (input.status < 400) return;
  const failure = matchRule(normalized, FAILURE_RULES);
  if (!failure) return;

  const account = await getSessionUser(input.headers);
  await recordAuditEvent(input.db, {
    action: failure.action,
    eventType: failure.eventType,
    category: "AUTHENTICATION",
    result: "failure",
    actorUserId: account?.id ?? null,
    targetUserId: account?.id ?? null,
    actorEmail: account?.email ?? null,
    metadata: { status: input.status },
    requestContext: ctx,
  });
}
