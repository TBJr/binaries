import { describe, expect, it } from "vitest";

import { permissionForRequest } from "../auth/permissions.js";
import { selfProfileAuditMetadata, updateAccountProfileSchema } from "../validation/account-profile.js";

describe("account profile", () => {
  it("validates display name updates", () => {
    expect(updateAccountProfileSchema.safeParse({ name: "Ada Lovelace" }).success).toBe(true);
    expect(updateAccountProfileSchema.safeParse({ name: "  Ada  " }).success).toBe(true);
    expect(updateAccountProfileSchema.safeParse({ name: "" }).success).toBe(false);
    expect(updateAccountProfileSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(updateAccountProfileSchema.safeParse({ name: "a".repeat(121) }).success).toBe(false);
    expect(updateAccountProfileSchema.safeParse({}).success).toBe(false);
  });

  it("keeps account profile routes outside the app permission map", () => {
    expect(permissionForRequest("/api/account/profile", "GET")).toBeNull();
    expect(permissionForRequest("/api/account/profile", "PATCH")).toBeNull();
    expect(permissionForRequest("/api/account/security", "GET")).toBeNull();
  });

  it("records self-profile audit metadata without password fields", () => {
    const metadata = selfProfileAuditMetadata(["name"]);
    expect(metadata).toEqual({ method: "self_profile", fields: ["name"] });
    expect(metadata).not.toHaveProperty("password");
    expect(JSON.stringify(metadata)).not.toMatch(/password/i);
  });
});
