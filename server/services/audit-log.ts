import { and, count, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { z } from "zod";

import { getAuditRequestContext } from "../lib/audit-request-context.js";
import {
  auditActionLabel,
  categoryForAction,
  type AuditActorType,
  type AuditCategory,
} from "../lib/audit-taxonomy.js";
import { parseClientFromUserAgent } from "../lib/client-context.js";
import { auditEventTypeForAction, sanitizeAuditMetadata, type AuditResult } from "../lib/security-audit.js";
import type { Database } from "../db/index.js";
import { adminAuditEvents, user } from "../db/schema.js";

export type AuditRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  acceptLanguage?: string | null;
  country?: string | null;
};

export type RecordAuditEventInput = {
  action: string;
  category?: AuditCategory;
  eventType?: string;
  result?: AuditResult;
  outcome?: AuditResult;
  actorId?: string | null;
  actorUserId?: string | null;
  actorType?: AuditActorType;
  actorEmail?: string | null;
  targetUserId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  requestContext?: AuditRequestContext;
};

type DbWriter = Pick<Database, "insert">;

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

export const auditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  action: z.string().max(120).optional(),
  eventType: z.string().max(80).optional(),
  category: z.string().max(40).optional(),
  result: z.enum(["success", "failure"]).optional(),
  actorUserId: z.string().max(128).optional(),
  resourceType: z.string().max(80).optional(),
  resourceId: z.string().max(128).optional(),
  q: z.string().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

function mergeAuditRequestContext(input?: AuditRequestContext): AuditRequestContext {
  const ambient = getAuditRequestContext();
  return {
    ipAddress: input?.ipAddress ?? ambient?.ipAddress ?? null,
    userAgent: input?.userAgent ?? ambient?.userAgent ?? null,
    requestId: input?.requestId ?? ambient?.requestId ?? null,
    acceptLanguage: input?.acceptLanguage ?? ambient?.acceptLanguage ?? null,
    country: input?.country ?? ambient?.country ?? null,
  };
}

function enrichAuditMetadata(
  metadata: Record<string, unknown> | undefined,
  ctx: AuditRequestContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(metadata ?? {}) };
  const ambient = getAuditRequestContext();
  if (!out.client) {
    const client = ambient?.client ?? parseClientFromUserAgent(ctx.userAgent ?? null);
    if (client.browser || client.os || client.deviceType) {
      out.client = client;
    }
  }
  if (!out.locale && ctx.acceptLanguage) {
    out.locale = ctx.acceptLanguage;
  }
  if (!out.country && ctx.country) {
    out.country = ctx.country;
  }
  return out;
}

export async function recordAuditEvent(db: DbWriter, input: RecordAuditEventInput) {
  const actorUserId = input.actorUserId ?? input.actorId ?? null;
  const result = input.result ?? input.outcome ?? "success";
  const category = input.category ?? categoryForAction(input.action);
  const description = input.description ?? auditActionLabel(input.action);
  const ctx = mergeAuditRequestContext(input.requestContext);

  await db.insert(adminAuditEvents).values({
    id: crypto.randomUUID(),
    actorUserId,
    targetUserId: input.targetUserId ?? null,
    action: input.action,
    eventType: input.eventType ?? auditEventTypeForAction(input.action),
    category,
    result,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    description,
    requestId: ctx.requestId ?? null,
    actorType: input.actorType ?? (actorUserId ? "user" : "system"),
    actorEmail: input.actorEmail ?? null,
    ipAddress: ctx.ipAddress ?? null,
    userAgent: ctx.userAgent ?? null,
    metadata: sanitizeAuditMetadata(enrichAuditMetadata(input.metadata, ctx)),
  });
}

/** @deprecated Use recordAuditEvent — kept for existing call sites. */
export async function recordAudit(
  db: DbWriter,
  input: {
    actorUserId: string | null;
    targetUserId?: string | null;
    action: string;
    eventType?: string;
    result?: AuditResult;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
    category?: AuditCategory;
    resourceType?: string | null;
    resourceId?: string | null;
    description?: string | null;
    actorType?: AuditActorType;
    actorEmail?: string | null;
    requestId?: string | null;
  },
) {
  await recordAuditEvent(db, {
    action: input.action,
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    eventType: input.eventType,
    result: input.result,
    category: input.category,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    description: input.description,
    actorType: input.actorType,
    actorEmail: input.actorEmail,
    metadata: input.metadata,
    requestContext: {
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      requestId: input.requestId,
    },
  });
}

function serializeAuditRow(row: typeof adminAuditEvents.$inferSelect) {
  return {
    id: row.id,
    action: row.action,
    eventType: row.eventType,
    category: row.category,
    result: row.result,
    description: row.description,
    actorUserId: row.actorUserId,
    actorType: row.actorType,
    actorEmail: row.actorEmail,
    targetUserId: row.targetUserId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    requestId: row.requestId,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAuditEvents(db: Database, query: z.infer<typeof auditListQuerySchema>) {
  const filters = [];
  if (query.action) filters.push(eq(adminAuditEvents.action, query.action));
  if (query.eventType) filters.push(eq(adminAuditEvents.eventType, query.eventType));
  if (query.category) filters.push(eq(adminAuditEvents.category, query.category));
  if (query.result) filters.push(eq(adminAuditEvents.result, query.result));
  if (query.actorUserId) filters.push(eq(adminAuditEvents.actorUserId, query.actorUserId));
  if (query.resourceType) filters.push(eq(adminAuditEvents.resourceType, query.resourceType));
  if (query.resourceId) filters.push(eq(adminAuditEvents.resourceId, query.resourceId));
  if (query.from) {
    const from = new Date(query.from);
    if (!Number.isNaN(from.getTime())) filters.push(gte(adminAuditEvents.createdAt, from));
  }
  if (query.to) {
    const to = new Date(query.to);
    if (!Number.isNaN(to.getTime())) filters.push(lte(adminAuditEvents.createdAt, to));
  }
  if (query.q?.trim()) {
    const term = `%${query.q.trim()}%`;
    filters.push(
      or(
        ilike(adminAuditEvents.action, term),
        ilike(adminAuditEvents.description, term),
        ilike(adminAuditEvents.resourceId, term),
      ),
    );
  }

  const where = filters.length ? and(...filters) : undefined;
  const rows = await db
    .select()
    .from(adminAuditEvents)
    .where(where)
    .orderBy(desc(adminAuditEvents.createdAt), desc(adminAuditEvents.id))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);
  const [totalRow] = await db.select({ total: count() }).from(adminAuditEvents).where(where);

  const total = Number(totalRow?.total ?? 0);
  return {
    events: rows.map(serializeAuditRow),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getAuditEvent(db: Database, id: string) {
  const [row] = await db.select().from(adminAuditEvents).where(eq(adminAuditEvents.id, id)).limit(1);
  return row ? serializeAuditRow(row) : null;
}

export async function getAuditSummary(db: Database) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [events24h] = await db
    .select({ total: count() })
    .from(adminAuditEvents)
    .where(gte(adminAuditEvents.createdAt, since));
  const [failedAuth] = await db
    .select({ total: count() })
    .from(adminAuditEvents)
    .where(
      and(
        gte(adminAuditEvents.createdAt, since),
        eq(adminAuditEvents.action, "auth_sign_in_failed"),
      ),
    );
  const [adminChanges] = await db
    .select({ total: count() })
    .from(adminAuditEvents)
    .where(
      and(
        gte(adminAuditEvents.createdAt, since),
        or(
          eq(adminAuditEvents.category, "USER_MANAGEMENT"),
          eq(adminAuditEvents.category, "ROLE_MANAGEMENT"),
          ilike(adminAuditEvents.action, "user%"),
          ilike(adminAuditEvents.action, "invitation%"),
          ilike(adminAuditEvents.action, "role_%"),
        ),
      ),
    );
  const [securityEvents] = await db
    .select({ total: count() })
    .from(adminAuditEvents)
    .where(
      and(
        gte(adminAuditEvents.createdAt, since),
        or(
          eq(adminAuditEvents.category, "SECURITY"),
          eq(adminAuditEvents.category, "AUTHENTICATION"),
          ilike(adminAuditEvents.action, "password%"),
          ilike(adminAuditEvents.action, "auth_%"),
          ilike(adminAuditEvents.action, "two_factor%"),
        ),
      ),
    );

  return {
    since: since.toISOString(),
    eventsLast24Hours: Number(events24h?.total ?? 0),
    failedAuthenticationLast24Hours: Number(failedAuth?.total ?? 0),
    administrativeChangesLast24Hours: Number(adminChanges?.total ?? 0),
    securityEventsLast24Hours: Number(securityEvents?.total ?? 0),
  };
}

export async function enrichAuditActors(
  db: Database,
  events: ReturnType<typeof serializeAuditRow>[],
) {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.actorUserId) ids.add(event.actorUserId);
    if (event.targetUserId) ids.add(event.targetUserId);
  }
  if (ids.size === 0) return events;
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(inArray(user.id, [...ids]));
  const map = new Map(rows.map((row) => [row.id, row]));
  return events.map((event) => ({
    ...event,
    actor: event.actorUserId ? map.get(event.actorUserId) ?? null : null,
    target: event.targetUserId ? map.get(event.targetUserId) ?? null : null,
  }));
}
