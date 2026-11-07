import { afterEach, describe, expect, it } from "vitest";

import { loadEnv, loadWorkerEnv } from "../env.js";

const AUTH_URL_KEYS = ["BETTER_AUTH_URL", "FRONTEND_URL"] as const;

describe("loadEnv vs loadWorkerEnv", () => {
  const saved: Partial<Record<(typeof AUTH_URL_KEYS)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of AUTH_URL_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
      delete saved[key];
    }
  });

  function clearAuthUrls() {
    for (const key of AUTH_URL_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  }

  it("loadWorkerEnv succeeds without BETTER_AUTH_URL and FRONTEND_URL", () => {
    clearAuthUrls();
    const env = loadWorkerEnv();
    expect(env.DATABASE_URL).toBeTruthy();
    expect(env.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it("loadEnv fails with field paths when auth URLs are missing", () => {
    clearAuthUrls();
    expect(() => loadEnv()).toThrow(/Invalid server environment/);
    try {
      loadEnv();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("BETTER_AUTH_URL:");
      expect(message).toContain("FRONTEND_URL:");
    }
  });
});
