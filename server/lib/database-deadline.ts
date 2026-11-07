import { invalidateDbCache } from "../db/index.js";
import { DatabaseUnavailableError } from "./db-errors.js";
import { DeadlineExceededError, withRejectingDeadline } from "./startup-log.js";

/** Bound request-path DB work so a wedged Neon socket cannot burn Vercel’s 120s limit. */
export const DATABASE_REQUEST_DEADLINE_MS = 8_000;

/**
 * Run DB-bound work with a rejecting deadline. On timeout, drop the cached
 * pool so the next `createDb()` opens a fresh socket.
 */
export async function withDatabaseDeadline<T>(
  work: () => Promise<T>,
  label: string,
  ms: number = DATABASE_REQUEST_DEADLINE_MS,
): Promise<T> {
  try {
    return await withRejectingDeadline(work(), ms, label);
  } catch (error) {
    if (error instanceof DeadlineExceededError) {
      invalidateDbCache();
      throw new DatabaseUnavailableError("timeout");
    }
    throw error;
  }
}
