import { eq } from "drizzle-orm";

import type { Database } from "../db/index.js";
import { campaigns, deliveryJobAttempts, deliveryJobs } from "../db/schema.js";
import { MailboxError } from "../mail/errors.js";
import { submitSingleRecipientMessage } from "../mail/smtp.js";
import {
  campaignDeliveryIdempotencyKey,
  loadQueueEnv,
} from "../queue/configuration.js";
import { loadActiveMailConfig } from "./mail-provider.js";
import { recordQueueEvent } from "./queue-events.js";
import { recheckRecipientEligibility } from "./simulation-processor.js";
import { releaseDailySendSlot, reserveDailySendSlot } from "./daily-send-cap.js";

export type DeliverySkipReason =
  | "campaign_cancelled"
  | "campaign_paused"
  | "recipient_ineligible"
  | "contact_missing"
  | "daily_cap_exceeded"
  | "mail_not_configured";

export type DeliveryResult =
  | { outcome: "completed"; providerMessageId: string | null }
  | { outcome: "skipped"; reason: DeliverySkipReason; message: string }
  | { outcome: "failed"; code: string; message: string; retryable: boolean };

function isRetryableMailboxError(error: MailboxError) {
  if (error.code === "SMTP_UNCERTAIN") return false;
  if (error.code === "SMTP_REJECTED" || error.code === "SMTP_SEND_FAILED") return false;
  if (error.status === 400 || error.status === 404) return false;
  return error.status === 502 || error.status === 503;
}

export async function deliverCampaignJob(
  db: Database,
  deliveryJobId: string,
): Promise<DeliveryResult> {
  const env = loadQueueEnv();
  if (env.QUEUE_SIMULATION_ONLY) {
    return {
      outcome: "failed",
      code: "delivery_disabled",
      message: "Live campaign delivery requires QUEUE_SIMULATION_ONLY=false",
      retryable: false,
    };
  }

  const [job] = await db.select().from(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId)).limit(1);
  if (!job) {
    return { outcome: "failed", code: "job_not_found", message: "Job not found", retryable: false };
  }

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, job.campaignId)).limit(1);
  if (!campaign) {
    return { outcome: "failed", code: "campaign_not_found", message: "Campaign not found", retryable: false };
  }

  if (campaign.status === "cancelled") {
    return { outcome: "skipped", reason: "campaign_cancelled", message: "Campaign was cancelled" };
  }
  if (campaign.queuePaused) {
    return { outcome: "skipped", reason: "campaign_paused", message: "Campaign is paused" };
  }

  const eligibility = await recheckRecipientEligibility(db, job.userId, job.campaignRecipientId);
  if (!eligibility.eligible) {
    return {
      outcome: "skipped",
      reason: eligibility.reason === "contact_missing" ? "contact_missing" : "recipient_ineligible",
      message: eligibility.reason,
    };
  }

  const { loaded } = await loadActiveMailConfig(db);
  if (!loaded.ok) {
    return {
      outcome: "skipped",
      reason: "mail_not_configured",
      message: "Outbound mail is not configured on this worker",
    };
  }

  const reservation = await reserveDailySendSlot(env);
  if (!reservation.allowed) {
    return {
      outcome: "skipped",
      reason: "daily_cap_exceeded",
      message: `Daily send cap of ${reservation.cap} messages has been reached`,
    };
  }

  try {
    const submitted = await submitSingleRecipientMessage(loaded.config, {
      to: eligibility.email,
      subject: campaign.subject,
      text: campaign.bodyText || campaign.subject,
      html: campaign.bodyHtml || `<p>${campaign.bodyText || campaign.subject}</p>`,
      idempotencyKey: campaignDeliveryIdempotencyKey(deliveryJobId),
    });
    return {
      outcome: "completed",
      providerMessageId: submitted.messageId || null,
    };
  } catch (error) {
    await releaseDailySendSlot(env).catch(() => undefined);
    if (error instanceof MailboxError) {
      return {
        outcome: "failed",
        code: error.code,
        message: error.message,
        retryable: isRetryableMailboxError(error),
      };
    }
    return {
      outcome: "failed",
      code: "send_failed",
      message: error instanceof Error ? error.message : "Send failed",
      retryable: true,
    };
  }
}

export async function persistDeliveryOutcome(
  db: Database,
  deliveryJobId: string,
  result: DeliveryResult,
  attemptNumber: number,
) {
  const now = new Date();
  const attemptId = crypto.randomUUID();

  if (result.outcome === "completed") {
    await db.insert(deliveryJobAttempts).values({
      id: attemptId,
      deliveryJobId,
      attemptNumber,
      status: "delivered",
      startedAt: now,
      finishedAt: now,
    });
    await db
      .update(deliveryJobs)
      .set({
        status: "delivered",
        attemptCount: attemptNumber,
        finishedAt: now,
        updatedAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
        providerMessageId: result.providerMessageId,
      })
      .where(eq(deliveryJobs.id, deliveryJobId));
    await recordQueueEvent(db, {
      deliveryJobId,
      eventType: "job_delivered",
      metadata: { attemptNumber, providerMessageId: result.providerMessageId },
    });
    return;
  }

  if (result.outcome === "skipped") {
    await db.insert(deliveryJobAttempts).values({
      id: attemptId,
      deliveryJobId,
      attemptNumber,
      status: "skipped",
      startedAt: now,
      finishedAt: now,
      errorCode: result.reason,
      errorMessage: result.message,
    });
    await db
      .update(deliveryJobs)
      .set({
        status: "skipped",
        skipReason: result.reason,
        attemptCount: attemptNumber,
        finishedAt: now,
        updatedAt: now,
        lastErrorCode: result.reason,
        lastErrorMessage: result.message,
      })
      .where(eq(deliveryJobs.id, deliveryJobId));
    await recordQueueEvent(db, {
      deliveryJobId,
      eventType: "job_skipped",
      metadata: { reason: result.reason },
    });
    return;
  }

  await db.insert(deliveryJobAttempts).values({
    id: attemptId,
    deliveryJobId,
    attemptNumber,
    status: "send_failed",
    startedAt: now,
    finishedAt: now,
    errorCode: result.code,
    errorMessage: result.message,
  });

  const [job] = await db.select().from(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId)).limit(1);
  const maxAttempts = job?.maxAttempts ?? 3;
  const terminal = !result.retryable || attemptNumber >= maxAttempts;

  await db
    .update(deliveryJobs)
    .set({
      status: terminal ? "send_failed" : "retry_wait",
      attemptCount: attemptNumber,
      finishedAt: terminal ? now : null,
      updatedAt: now,
      lastErrorCode: result.code,
      lastErrorMessage: result.message,
    })
    .where(eq(deliveryJobs.id, deliveryJobId));

  await recordQueueEvent(db, {
    deliveryJobId,
    eventType: "job_send_failed",
    metadata: { code: result.code, retryable: result.retryable, terminal },
  });

  if (!terminal) {
    throw new Error("DELIVERY_RETRY");
  }
}
