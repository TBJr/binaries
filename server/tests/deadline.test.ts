import { describe, expect, it } from "vitest";

import { withDatabaseDeadline } from "../lib/database-deadline.js";
import { DatabaseUnavailableError, publicApiError } from "../lib/db-errors.js";
import { DeadlineExceededError, withRejectingDeadline } from "../lib/startup-log.js";

describe("withRejectingDeadline", () => {
  it("resolves when work finishes before the deadline", async () => {
    await expect(withRejectingDeadline(Promise.resolve("ok"), 200, "fast")).resolves.toBe("ok");
  });

  it("rejects with DeadlineExceededError when work never settles", async () => {
    const started = Date.now();
    await expect(withRejectingDeadline(new Promise(() => undefined), 40, "stuck")).rejects.toBeInstanceOf(
      DeadlineExceededError,
    );
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("withDatabaseDeadline", () => {
  it("maps a hung query to DatabaseUnavailableError timeout", async () => {
    const started = Date.now();
    await expect(
      withDatabaseDeadline(() => new Promise(() => undefined), "middleware-db", 40),
    ).rejects.toMatchObject({ name: "DatabaseUnavailableError", kind: "timeout" });
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("database timeout mapping", () => {
  it("maps DatabaseUnavailableError timeout to 503 database_unavailable", () => {
    const mapped = publicApiError(new DatabaseUnavailableError("timeout"));
    expect(mapped.status).toBe(503);
    expect(mapped.body).toEqual({
      error: "Database is temporarily unavailable.",
      code: "database_unavailable",
    });
  });
});
