import { Redis } from "ioredis";

import { safeErrorLabel } from "../lib/startup-log.js";
import { loadQueueEnv } from "./configuration.js";
import type { RedisOptions } from "ioredis";

import {
  buildApiRedisOptions,
  buildBullmqRedisOptions,
  buildHealthRedisOptions,
} from "./redis-connection-options.js";
import { maskRedisUrl } from "./redis-url.js";

type RedisClient = Redis;

let sharedConnection: RedisClient | null = null;

function sanitizeRedisError(message: string) {
  return message.replace(/rediss?:\/\/\S+/gi, "[redis-url]");
}

function attachSafeErrorLogging(client: RedisClient, label: string) {
  client.on("error", (error) => {
    const message = error instanceof Error ? error.message : "connection error";
    console.error(`[redis:${label}]`, sanitizeRedisError(message));
  });
}

function createRedisClient(redisUrl: string, label: string, options: RedisOptions): RedisClient {
  const client = new Redis(redisUrl, options);
  attachSafeErrorLogging(client, label);
  return client;
}

/** Shared connection for API enqueue/pause/resume — fail-fast options. */
export function getRedisConnection(): RedisClient {
  const env = loadQueueEnv();
  if (!env.QUEUE_ENABLED || !env.REDIS_URL) {
    throw new Error("QUEUE_DISABLED");
  }
  if (!sharedConnection) {
    sharedConnection = createRedisClient(env.REDIS_URL, "shared", buildApiRedisOptions(env.REDIS_URL));
  }
  return sharedConnection;
}

/**
 * BullMQ workers need a dedicated blocking connection with worker Redis options
 * (not a duplicate of the fail-fast API client).
 */
export function getWorkerRedisConnection(): RedisClient {
  const env = loadQueueEnv();
  if (!env.QUEUE_ENABLED || !env.REDIS_URL) {
    throw new Error("QUEUE_DISABLED");
  }
  return createRedisClient(env.REDIS_URL, "worker", buildBullmqRedisOptions(env.REDIS_URL));
}

export function describeRedisTarget() {
  const env = loadQueueEnv();
  if (!env.REDIS_URL) {
    return { enabled: env.QUEUE_ENABLED, target: null };
  }
  return {
    enabled: env.QUEUE_ENABLED,
    target: maskRedisUrl(env.REDIS_URL),
  };
}

export async function closeRedisConnection() {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}

export async function probeRedis(): Promise<"ok" | "unavailable" | "disabled"> {
  let redisUrl: string | undefined;
  try {
    const env = loadQueueEnv();
    if (!env.QUEUE_ENABLED || !env.REDIS_URL?.trim()) return "disabled";
    redisUrl = env.REDIS_URL;
  } catch (error) {
    console.error("[health] redis", safeErrorLabel(error));
    return "unavailable";
  }

  const client = new Redis(redisUrl, buildHealthRedisOptions(redisUrl));
  attachSafeErrorLogging(client, "health");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = (async (): Promise<"ok" | "unavailable"> => {
    await client.connect();
    const pong = await client.ping();
    return pong === "PONG" ? "ok" : "unavailable";
  })().catch((error: unknown) => {
    console.error("[health] redis", safeErrorLabel(error));
    return "unavailable" as const;
  });
  try {
    return await Promise.race([
      attempt,
      new Promise<"unavailable">((resolve) => {
        timer = setTimeout(() => {
          console.error("[health] redis timed out");
          resolve("unavailable");
        }, 4_500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    client.disconnect();
  }
}

export function isQueueEnabled() {
  try {
    const env = loadQueueEnv();
    return env.QUEUE_ENABLED && Boolean(env.REDIS_URL?.trim());
  } catch {
    return false;
  }
}
