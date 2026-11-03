import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import type { Database } from "../db/index.js";
import { recordAuditEvent } from "./audit-log.js";
import type { QueueEventType } from "./queue-events.js";

const MIRROR: Partial<
  Record<
    QueueEventType,
    {
      action: string;
      category: "QUEUE" | "CAMPAIGN";
      result?: "success" | "failure";
      actorType?: "worker" | "system" | "user";
    }
  >
> = {
  campaign_enqueued: {
    action: AUDIT_ACTIONS.campaignSimulationRequested,
    category: "CAMPAIGN",
  },
  campaign_queue_cancelled: {
    action: AUDIT_ACTIONS.campaignCancelled,
    category: "CAMPAIGN",
  },
  job_simulation_failed: {
    action: AUDIT_ACTIONS.queueSimulationJobFailed,
    category: "QUEUE",
    result: "failure",
    actorType: "worker",
  },
};

export async function mirrorQueueEventToAudit(
  db: Pick<Database, "insert">,
  input: {
    eventType: QueueEventType;
    campaignId?: string | null;
    deliveryJobId?: string | null;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const rule = MIRROR[input.eventType];
  if (!rule) return;
  const terminal = input.metadata?.terminal;
  if (input.eventType === "job_simulation_failed" && terminal !== true) {
    return;
  }

  await recordAuditEvent(db, {
    action: rule.action,
    category: rule.category,
    result: rule.result ?? "success",
    actorUserId: input.actorUserId ?? null,
    actorType: rule.actorType ?? (input.actorUserId ? "user" : "worker"),
    resourceType: input.campaignId ? "campaign" : "delivery_job",
    resourceId: input.campaignId ?? input.deliveryJobId ?? null,
    metadata: {
      deliveryJobId: input.deliveryJobId,
      simulationOnly: true,
      ...input.metadata,
    },
  });
}
