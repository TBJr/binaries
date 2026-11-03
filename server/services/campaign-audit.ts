import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import type { Database } from "../db/index.js";
import { campaignEvents } from "../db/schema.js";
import { recordAuditEvent } from "./audit-log.js";

type DbInsert = Pick<Database, "insert">;

export type CampaignEventType =
  | "campaign_created"
  | "campaign_updated"
  | "content_selected"
  | "recipients_updated"
  | "eligibility_checked"
  | "campaign_marked_ready"
  | "schedule_configured"
  | "campaign_cancelled"
  | "campaign_duplicated"
  | "campaign_reverted_to_draft"
  | "campaign_prepared"
  | "campaign_deleted";

/** Campaign lifecycle events that also appear in the global admin audit log. */
const GLOBAL_AUDIT_MIRROR: Partial<Record<CampaignEventType, string>> = {
  campaign_created: AUDIT_ACTIONS.campaignCreated,
  campaign_updated: AUDIT_ACTIONS.campaignUpdated,
  campaign_duplicated: AUDIT_ACTIONS.campaignDuplicated,
  campaign_cancelled: AUDIT_ACTIONS.campaignCancelled,
  campaign_reverted_to_draft: AUDIT_ACTIONS.campaignRevertedToDraft,
  campaign_marked_ready: AUDIT_ACTIONS.campaignMarkedReady,
  campaign_deleted: AUDIT_ACTIONS.campaignDeleted,
};

export async function recordCampaignEvent(
  db: DbInsert,
  input: {
    campaignId: string;
    actorUserId: string;
    eventType: CampaignEventType;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(campaignEvents).values({
    id: crypto.randomUUID(),
    campaignId: input.campaignId,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    metadata: input.metadata,
  });

  const mirroredAction = GLOBAL_AUDIT_MIRROR[input.eventType];
  if (mirroredAction) {
    await recordAuditEvent(db, {
      action: mirroredAction,
      category: "CAMPAIGN",
      eventType: "campaign",
      result: "success",
      actorUserId: input.actorUserId,
      resourceType: "campaign",
      resourceId: input.campaignId,
      metadata: input.metadata,
    }).catch((error) => {
      console.error(
        "[audit] campaign mirror failed",
        error instanceof Error ? error.name : "error",
      );
    });
  }
}

export function serializeCampaignEvent(row: typeof campaignEvents.$inferSelect) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    actorUserId: row.actorUserId,
    eventType: row.eventType,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
