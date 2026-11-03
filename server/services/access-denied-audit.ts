import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import type { Database } from "../db/index.js";
import { clientIpFromHeaders, userAgentFromHeaders } from "../lib/request-context.js";
import { recordAuditEvent } from "./audit-log.js";

export async function recordAccessDeniedAudit(
  db: Database,
  input: {
    actorUserId: string;
    actorEmail?: string | null;
    permission?: string | null;
    path: string;
    headers: Headers;
  },
) {
  try {
    await recordAuditEvent(db, {
      action: AUDIT_ACTIONS.adminAccessDenied,
      category: "ADMINISTRATION",
      eventType: "administration",
      result: "failure",
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail ?? null,
      resourceType: "route",
      resourceId: input.path.slice(0, 128),
      metadata: {
        path: input.path,
        ...(input.permission ? { permission: input.permission } : {}),
      },
      requestContext: {
        ipAddress: clientIpFromHeaders(input.headers),
        userAgent: userAgentFromHeaders(input.headers),
      },
    });
  } catch {
    // Never fail the request because of audit write issues.
  }
}
