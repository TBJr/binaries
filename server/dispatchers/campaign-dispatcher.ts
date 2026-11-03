import { Worker } from "bullmq";

import { closeDb, createDb } from "../db/index.js";
import { loadEnv } from "../env.js";
import { safeErrorLabel } from "../lib/startup-log.js";
import { getQueueNames, loadQueueEnv } from "../queue/configuration.js";
import {
  closeRedisConnection,
  getWorkerRedisConnection,
} from "../queue/connection.js";
import type { CampaignDispatchJobData } from "../queue/job-types.js";
import { closeQueues } from "../queue/queues.js";
import { dispatchCampaignJobs } from "../services/queue-service.js";
import { reconcileOrphanedPendingJobs } from "../services/queue-reconciliation.js";

const env = loadEnv();
const queueEnv = loadQueueEnv();
const { db } = createDb(env);

let worker: Worker<CampaignDispatchJobData> | null = null;
let workerConnection: ReturnType<typeof getWorkerRedisConnection> | null = null;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;

function startDispatcher() {
  workerConnection = getWorkerRedisConnection();
  worker = new Worker<CampaignDispatchJobData>(
    getQueueNames(queueEnv).campaignDispatch,
    async (job) => {
      await dispatchCampaignJobs(db, job.data.campaignId);
    },
    {
      connection: workerConnection,
      concurrency: 2,
    },
  );

  reconcileTimer = setInterval(() => {
    reconcileOrphanedPendingJobs(db).catch((error) => {
      console.error("[dispatcher] reconciliation failed", safeErrorLabel(error));
    });
  }, 30_000);
}

async function shutdown(signal: string) {
  console.info(`[dispatcher] shutting down (${signal})`);
  if (reconcileTimer) clearInterval(reconcileTimer);
  await worker?.close();
  await workerConnection?.quit();
  workerConnection = null;
  await closeQueues();
  await closeRedisConnection();
  await closeDb();
  process.exit(0);
}

if (!queueEnv.QUEUE_ENABLED) {
  console.error("QUEUE_ENABLED=false — dispatcher not started");
  process.exit(1);
}

startDispatcher();
console.info("[dispatcher] listening");

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
