import { describe, expect, it } from "vitest";

import {
  campaignDeliveryIdempotencyKey,
  dailySendCapRedisKey,
  queueEnvSchema,
} from "../queue/configuration.js";

describe("queue configuration", () => {
  it("allows disabling simulation-only mode for live delivery", () => {
    const parsed = queueEnvSchema.safeParse({
      QUEUE_ENABLED: "true",
      QUEUE_SIMULATION_ONLY: "false",
      REDIS_URL: "redis://127.0.0.1:6379",
      QUEUE_DAILY_SEND_CAP: "2000",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.QUEUE_SIMULATION_ONLY).toBe(false);
      expect(parsed.data.QUEUE_DAILY_SEND_CAP).toBe(2000);
    }
  });

  it("defaults to simulation-only and a 2000 daily send cap", () => {
    const parsed = queueEnvSchema.safeParse({
      QUEUE_ENABLED: "false",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.QUEUE_SIMULATION_ONLY).toBe(true);
      expect(parsed.data.QUEUE_DAILY_SEND_CAP).toBe(2000);
    }
  });

  it("requires REDIS_URL when queue is enabled", () => {
    const parsed = queueEnvSchema.safeParse({
      QUEUE_ENABLED: "true",
      QUEUE_SIMULATION_ONLY: "true",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-redis REDIS_URL values when queue is enabled", () => {
    const parsed = queueEnvSchema.safeParse({
      QUEUE_ENABLED: "true",
      QUEUE_SIMULATION_ONLY: "true",
      REDIS_URL: "https://example.upstash.io",
    });
    expect(parsed.success).toBe(false);
  });

  it("keeps delivery idempotency keys stable per job", () => {
    expect(campaignDeliveryIdempotencyKey("job-1")).toBe("campaign-delivery:job-1");
    expect(campaignDeliveryIdempotencyKey("job-1")).toBe(campaignDeliveryIdempotencyKey("job-1"));
  });

  it("scopes the daily send counter by namespace and UTC date", () => {
    expect(dailySendCapRedisKey("binaries", new Date("2026-11-07T15:00:00.000Z"))).toBe(
      "binaries:daily-sends:2026-11-07",
    );
  });
});
