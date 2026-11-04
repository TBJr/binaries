import { describe, expect, it } from "vitest";

import { auditActionLabel, categoryForAction } from "../lib/audit-taxonomy.js";
import { hashSignupCode, isSignupRoleKey, signupCodeStatus } from "../lib/signup-codes.js";
import { auditEventTypeForAction } from "../lib/security-audit.js";
import { createSignupCodeSchema, publicRegistrationSchema } from "../validation/admin-users.js";

describe("role signup codes", () => {
  it("allows every system signup role except super-admin", () => {
    expect(isSignupRoleKey("user")).toBe(true);
    expect(isSignupRoleKey("viewer")).toBe(true);
    expect(isSignupRoleKey("editor")).toBe(true);
    expect(isSignupRoleKey("campaign-manager")).toBe(true);
    expect(isSignupRoleKey("admin")).toBe(true);
    expect(isSignupRoleKey("super-admin")).toBe(false);
    expect(isSignupRoleKey("unknown")).toBe(false);
  });

  it("rejects generating signup codes for super-admin", () => {
    expect(createSignupCodeSchema.safeParse({ roleKey: "admin" }).success).toBe(true);
    expect(createSignupCodeSchema.safeParse({ roleKey: "super-admin" }).success).toBe(false);
  });

  it("requires a valid non-super-admin role and matching passwords for public registration", () => {
    const registration = {
      name: "Example User",
      email: "user@example.com",
      password: "a-secure-test-password",
      confirmPassword: "a-secure-test-password",
      roleKey: "viewer",
      code: "a-valid-looking-registration-code",
    };
    expect(publicRegistrationSchema.safeParse(registration).success).toBe(true);
    expect(publicRegistrationSchema.safeParse({ ...registration, roleKey: "super-admin" }).success).toBe(false);
    expect(publicRegistrationSchema.safeParse({ ...registration, confirmPassword: "different-password" }).success).toBe(false);
  });

  it("hashes codes before persistence and determines expiry, use, and revocation", () => {
    const code = "one-time-signup-code";
    expect(hashSignupCode(code)).not.toBe(code);
    expect(hashSignupCode(code)).toHaveLength(64);

    const expiresAt = new Date(20_000);
    expect(signupCodeStatus({ expiresAt, usedAt: null, revokedAt: null }, 10_000)).toBe("active");
    expect(signupCodeStatus({ expiresAt, usedAt: new Date(5_000), revokedAt: null }, 10_000)).toBe("used");
    expect(signupCodeStatus({ expiresAt: new Date(5_000), usedAt: null, revokedAt: null }, 10_000)).toBe("expired");
    expect(signupCodeStatus({ expiresAt, usedAt: null, revokedAt: new Date(5_000) }, 10_000)).toBe("revoked");
  });

  it("labels signup-code audit events as user-management activity", () => {
    expect(auditActionLabel("signup_code_created")).toBe("Signup code generated");
    expect(categoryForAction("signup_code_created")).toBe("USER_MANAGEMENT");
    expect(auditEventTypeForAction("signup_completed")).toBe("signup");
  });
});
