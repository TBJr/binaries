import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "../db/index.js";
import { adminAuditEvents } from "../db/schema.js";
import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import type { AuditRequestContext } from "./audit-log.js";
import { recordAuditEvent } from "./audit-log.js";

export const PAGE_VIEW_DEDUPE_MS = 30_000;
export const PAGE_VIEW_PATH_MAX = 512;

export const pageViewBodySchema = z.object({
  path: z.string().min(1).max(PAGE_VIEW_PATH_MAX),
  title: z.string().max(200).optional(),
});

/** App-relative path only; rejects absolute URLs and protocol-relative hosts. */
export function normalizePageViewPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(trimmed)) return null;
  if (trimmed.length > PAGE_VIEW_PATH_MAX) return null;
  return trimmed;
}

export async function recordPageViewActivity(
  db: Database,
  input: {
    actorUserId: string;
    actorEmail?: string | null;
    path: string;
    title?: string;
    requestContext?: AuditRequestContext;
  },
): Promise<{ ok: true; deduped: boolean }> {
  const path = normalizePageViewPath(input.path);
  if (!path) {
    return { ok: true, deduped: true };
  }

  const cutoff = new Date(Date.now() - PAGE_VIEW_DEDUPE_MS);
  const [recent] = await db
    .select({ id: adminAuditEvents.id })
    .from(adminAuditEvents)
    .where(
      and(
        eq(adminAuditEvents.actorUserId, input.actorUserId),
        eq(adminAuditEvents.action, AUDIT_ACTIONS.pageViewed),
        eq(adminAuditEvents.resourceId, path),
        gte(adminAuditEvents.createdAt, cutoff),
      ),
    )
    .limit(1);

  if (recent) {
    return { ok: true, deduped: true };
  }

  await recordAuditEvent(db, {
    action: AUDIT_ACTIONS.pageViewed,
    category: "ACTIVITY",
    eventType: "activity",
    result: "success",
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail ?? null,
    resourceType: "route",
    resourceId: path,
    metadata: {
      path,
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    },
    requestContext: input.requestContext,
  });

  return { ok: true, deduped: false };
}
