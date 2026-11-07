import { Worker } from "bullmq";

import { eq } from "drizzle-orm";

import { closeDb, createDb } from "../db/index.js";
import { deliveryJobs } from "../db/schema.js";
import { loadWorkerEnv } from "../env.js";
import { safeErrorLabel } from "../lib/startup-log.js";
import { getQueueNames, loadQueueEnv } from "../queue/configuration.js";
import {
  closeRedisConnection,
  getWorkerRedisConnection,
} from "../queue/connection.js";
import type { EmailProcessingJobData } from "../queue/job-types.js";
import { closeQueues } from "../queue/queues.js";
import {
  deliverCampaignJob,
  persistDeliveryOutcome,
} from "../services/campaign-delivery-processor.js";
import {
  persistSimulationOutcome,
  simulateDeliveryJob,
} from "../services/simulation-processor.js";
import { recordQueueEvent } from "../services/queue-events.js";
import { updateCampaignDeliveryProgress } from "../services/queue-service.js";

const env = loadWorkerEnv();
const queueEnv = loadQueueEnv();
const { db } = createDb(env);

let worker: Worker<EmailProcessingJobData> | null = null;
let workerConnection: ReturnType<typeof getWorkerRedisConnection> | null = null;

async function processJob(deliveryJobId: string) {
  const [job] = await db.select().from(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId)).limit(1);
  if (!job) return;

  const attemptNumber = job.attemptCount + 1;
  const startedAt = new Date();

  await db
    .update(deliveryJobs)
    .set({
      status: "processing",
      startedAt: job.startedAt ?? startedAt,
      attemptCount: attemptNumber,
      updatedAt: startedAt,
    })
    .where(eq(deliveryJobs.id, deliveryJobId));

  await recordQueueEvent(db, {
    campaignId: job.campaignId,
    deliveryJobId,
    eventType: "job_processing_started",
    metadata: { attemptNumber },
  });

  try {
    if (queueEnv.QUEUE_SIMULATION_ONLY) {
      const result = await simulateDeliveryJob(db, deliveryJobId);
      await persistSimulationOutcome(db, deliveryJobId, result, attemptNumber);
    } else {
      const result = await deliverCampaignJob(db, deliveryJobId);
      await persistDeliveryOutcome(db, deliveryJobId, result, attemptNumber);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "SIMULATION_RETRY" || error.message === "DELIVERY_RETRY")
    ) {
      throw error;
    }
    throw error;
  }
  await updateCampaignDeliveryProgress(db, job.campaignId);
}

function startWorker() {
  workerConnection = getWorkerRedisConnection();
  worker = new Worker<EmailProcessingJobData>(
    getQueueNames(queueEnv).emailProcessing,
    async (bullJob) => {
      await processJob(bullJob.data.deliveryJobId);
    },
    {
      connection: workerConnection,
      concurrency: queueEnv.QUEUE_WORKER_CONCURRENCY,
      limiter: {
        max: queueEnv.QUEUE_MAX_JOBS_PER_SECOND,
        duration: 1000,
      },
    },
  );

  worker.on("failed", (job, error) => {
    console.error("[worker:email-processing] job failed", job?.id, safeErrorLabel(error));
  });
}

async function shutdown(signal: string) {
  console.info(`[worker:email-processing] shutting down (${signal})`);
  await worker?.close();
  await workerConnection?.quit();
  workerConnection = null;
  await closeQueues();
  await closeRedisConnection();
  await closeDb();
  process.exit(0);
}

if (!queueEnv.QUEUE_ENABLED) {
  console.error("QUEUE_ENABLED=false — worker not started");
  process.exit(1);
}

startWorker();
console.info(
  `[worker:email-processing] listening mode=${queueEnv.QUEUE_SIMULATION_ONLY ? "simulation" : "delivery"}`,
);

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
