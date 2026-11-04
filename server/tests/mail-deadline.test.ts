import { describe, expect, it } from "vitest";

import { withMailDeadline } from "../mail/deadline.js";

describe("mail operation deadline", () => {
  it("returns a completed operation", async () => {
    await expect(withMailDeadline(Promise.resolve("sent"), 50, () => new Error("timeout"))).resolves.toBe(
      "sent",
    );
  });

  it("rejects a stalled operation with the caller's timeout error", async () => {
    await expect(
      withMailDeadline(new Promise(() => undefined), 5, () => new Error("mail timed out")),
    ).rejects.toThrow("mail timed out");
  });
});
