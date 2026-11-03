import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import type { Database } from "../db/index.js";
import type { FullAuditRequestContext } from "../lib/request-context.js";
import { getSessionUser } from "../lib/session.js";
import { recordAuditEvent } from "./audit-log.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const SKIP_EXACT = new Set(["/api/health", "/api/ping", "/api/activity/page-view"]);

export function shouldAuditApiMutation(method: string, path: string): boolean {
  if (!MUTATION_METHODS.has(method.toUpperCase())) return false;
  if (method.toUpperCase() === "OPTIONS") return false;
  const normalized = path.split("?")[0] ?? path;
  if (!normalized.startsWith("/api/")) return false;
  if (SKIP_EXACT.has(normalized)) return false;
  if (normalized.startsWith("/api/auth/")) return false;
  return true;
}

export async function recordApiMutationAudit(input: {
  db: Database;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  headers: Headers;
  requestContext: FullAuditRequestContext;
}) {
  if (!shouldAuditApiMutation(input.method, input.path)) return;

  let account: { id: string; email: string } | null = null;
  try {
    account = await getSessionUser(input.headers);
  } catch {
    return;
  }
  if (!account) return;

  const normalized = (input.path.split("?")[0] ?? input.path).slice(0, 256);
  await recordAuditEvent(input.db, {
    action: AUDIT_ACTIONS.apiMutation,
    category: "ACTIVITY",
    eventType: "activity",
    result: input.status < 400 ? "success" : "failure",
    actorUserId: account.id,
    actorEmail: account.email,
    resourceType: "api",
    resourceId: `${input.method.toUpperCase()} ${normalized}`.slice(0, 128),
    metadata: {
      method: input.method.toUpperCase(),
      path: normalized,
      status: input.status,
      durationMs: Math.max(0, Math.round(input.durationMs)),
    },
    requestContext: {
      ipAddress: input.requestContext.ipAddress,
      userAgent: input.requestContext.userAgent,
      requestId: input.requestContext.requestId,
      acceptLanguage: input.requestContext.acceptLanguage,
      country: input.requestContext.country,
    },
  });
}
