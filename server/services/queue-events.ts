import type { Database } from "../db/index.js";
import { queueEvents } from "../db/schema.js";
import { mirrorQueueEventToAudit } from "./queue-audit-mirror.js";

export type QueueEventType =
  | "campaign_enqueued"
  | "campaign_dispatch_started"
  | "campaign_dispatch_completed"
  | "job_published"
  | "job_processing_started"
  | "job_simulation_completed"
  | "job_simulation_failed"
  | "job_skipped"
  | "job_cancelled"
  | "campaign_paused"
  | "campaign_resumed"
  | "campaign_queue_cancelled"
  | "job_retry_requested"
  | "reconciliation_run";

export async function recordQueueEvent(
  db: Pick<Database, "insert">,
  input: {
    campaignId?: string | null;
    deliveryJobId?: string | null;
    actorUserId?: string | null;
    eventType: QueueEventType;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(queueEvents).values({
    id: crypto.randomUUID(),
    campaignId: input.campaignId ?? null,
    deliveryJobId: input.deliveryJobId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    metadata: input.metadata,
  });

  try {
    await mirrorQueueEventToAudit(db, input);
  } catch (error) {
    console.error("[audit] queue mirror failed", error instanceof Error ? error.message : "unknown");
  }
}

export function serializeQueueEvent(row: typeof queueEvents.$inferSelect) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    deliveryJobId: row.deliveryJobId,
    actorUserId: row.actorUserId,
    eventType: row.eventType,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
