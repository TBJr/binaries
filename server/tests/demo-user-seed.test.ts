import { describe, expect, it } from "vitest";

import { demoUserSeedSchema } from "../lib/demo-user-seed.js";

describe("demo-user seed file", () => {
  it("accepts each built-in account type and normalizes email addresses", () => {
    const parsed = demoUserSeedSchema.safeParse({
      users: [
        { email: "USER@example.com", name: "User", role: "user" },
        { email: "viewer@example.com", name: "Viewer", role: "viewer" },
        { email: "editor@example.com", name: "Editor", role: "editor" },
        { email: "campaign@example.com", name: "Campaign Manager", role: "campaign-manager" },
        { email: "admin@example.com", name: "Admin", role: "admin" },
        { email: "super@example.com", name: "Super Admin", role: "super-admin" },
      ],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.users.map((account) => account.role)).toEqual([
        "user",
        "viewer",
        "editor",
        "campaign-manager",
        "admin",
        "super-admin",
      ]);
      expect(parsed.data.users[0]?.email).toBe("user@example.com");
    }
  });

  it("rejects duplicate normalized emails and unknown account types", () => {
    expect(
      demoUserSeedSchema.safeParse({
        users: [
          { email: "Demo@example.com", name: "Demo", role: "user" },
          { email: "demo@example.com", name: "Duplicate", role: "viewer" },
        ],
      }).success,
    ).toBe(false);
    expect(
      demoUserSeedSchema.safeParse({
        users: [{ email: "demo@example.com", name: "Demo", role: "owner" }],
      }).success,
    ).toBe(false);
  });

  it("requires non-empty, bounded seed data", () => {
    expect(demoUserSeedSchema.safeParse({ users: [] }).success).toBe(false);
    expect(
      demoUserSeedSchema.safeParse({
        users: [{ email: "demo@example.com", name: " ", role: "user" }],
      }).success,
    ).toBe(false);
  });
});
