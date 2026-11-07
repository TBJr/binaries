import type { RedisOptions } from "ioredis";

import { assertRedisProtocolUrl } from "./redis-url.js";

/**
 * ioredis options for BullMQ.
 * Workers require blocking connections — use maxRetriesPerRequest: null.
 */
export function buildBullmqRedisOptions(redisUrl: string): RedisOptions {
  const parsed = assertRedisProtocolUrl(redisUrl);
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 20_000,
    retryStrategy(times) {
      if (times > 25) return null;
      return Math.min(200 + times * 200, 5_000);
    },
  };

  if (parsed.protocol === "rediss:") {
    options.tls = {};
  }

  return options;
}

/**
 * Vercel/API Queue producers must fail fast. Workers keep
 * `maxRetriesPerRequest: null` via `buildBullmqRedisOptions`.
 */
export function buildApiRedisOptions(redisUrl: string): RedisOptions {
  return {
    ...buildBullmqRedisOptions(redisUrl),
    maxRetriesPerRequest: 1,
    connectTimeout: 10_000,
    commandTimeout: 3_000,
    enableOfflineQueue: false,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(200 * times, 1_000);
    },
  };
}

/**
 * Request-scoped Redis options. Unlike BullMQ workers, health checks must not
 * retry forever or block the Node response until the function limit.
 */
export function buildHealthRedisOptions(redisUrl: string): RedisOptions {
  return {
    ...buildBullmqRedisOptions(redisUrl),
    connectTimeout: 4_000,
    commandTimeout: 3_000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    reconnectOnError: () => false,
    lazyConnect: true,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    autoResendUnfulfilledCommands: false,
  };
}
