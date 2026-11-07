import { dailySendCapRedisKey, loadQueueEnv, type QueueEnv } from "../queue/configuration.js";
import { getRedisConnection } from "../queue/connection.js";

function secondsUntilUtcMidnight(now = new Date()) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

export type DailySendCapReservation =
  | { allowed: true; count: number; cap: number }
  | { allowed: false; count: number; cap: number };

/**
 * Atomically reserve one outbound send against the UTC daily cap.
 * On reject, the counter is not incremented beyond the cap check (INCR then DECR if over).
 */
export async function reserveDailySendSlot(
  env: QueueEnv = loadQueueEnv(),
): Promise<DailySendCapReservation> {
  const redis = getRedisConnection();
  const key = dailySendCapRedisKey(env.QUEUE_NAMESPACE);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, secondsUntilUtcMidnight());
  }
  if (count > env.QUEUE_DAILY_SEND_CAP) {
    await redis.decr(key);
    return { allowed: false, count: count - 1, cap: env.QUEUE_DAILY_SEND_CAP };
  }
  return { allowed: true, count, cap: env.QUEUE_DAILY_SEND_CAP };
}

export async function releaseDailySendSlot(env: QueueEnv = loadQueueEnv()) {
  const redis = getRedisConnection();
  const key = dailySendCapRedisKey(env.QUEUE_NAMESPACE);
  const next = await redis.decr(key);
  if (next < 0) {
    await redis.set(key, "0", "EX", secondsUntilUtcMidnight(), "XX");
  }
}
