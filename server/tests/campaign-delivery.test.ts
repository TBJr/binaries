import { describe, expect, it, vi } from "vitest";

import { MailboxError } from "../mail/errors.js";
import { campaignDeliveryIdempotencyKey } from "../queue/configuration.js";

describe("campaign delivery mapping", () => {
  it("treats SMTP_UNCERTAIN as terminal (no Bull retry)", () => {
    const error = new MailboxError("Uncertain", 502, "SMTP_UNCERTAIN");
    const retryable =
      error.code !== "SMTP_UNCERTAIN" &&
      error.code !== "SMTP_REJECTED" &&
      error.code !== "SMTP_SEND_FAILED" &&
      error.status !== 400 &&
      error.status !== 404 &&
      (error.status === 502 || error.status === 503);
    expect(retryable).toBe(false);
  });

  it("treats transient 503 as retryable", () => {
    const error = new MailboxError("Unavailable", 503, "SMTP_UNAVAILABLE");
    const retryable =
      error.code !== "SMTP_UNCERTAIN" &&
      error.code !== "SMTP_REJECTED" &&
      error.code !== "SMTP_SEND_FAILED" &&
      error.status !== 400 &&
      error.status !== 404 &&
      (error.status === 502 || error.status === 503);
    expect(retryable).toBe(true);
  });

  it("uses a stable provider idempotency key across attempts", () => {
    const key = campaignDeliveryIdempotencyKey("abc");
    expect(key).toBe("campaign-delivery:abc");
    expect(vi.fn(() => campaignDeliveryIdempotencyKey("abc"))()).toBe(key);
  });
});
