import { describe, expect, it, vi } from "vitest";

import {
  isApiPathAllowedDuringPasswordChange,
  isApiPathAllowedDuringTwoFactorSetup,
  isAppPathAllowedDuringTwoFactorSetup,
  loadAccountSecurityState,
} from "../lib/account-security.js";
import { redactAuthEmailText } from "../lib/email.js";
import { sanitizeAuditMetadata } from "../lib/security-audit.js";
import { bootstrapPreflight } from "../services/bootstrap-admin.js";
import { shouldRedirectToTwoFactor, twoFactorLoginPath } from "../../src/lib/two-factor-redirect.js";

describe("account security gates", () => {
  it("allows password change endpoints during enforcement", () => {
    expect(isApiPathAllowedDuringPasswordChange("/api/account/change-password", "POST")).toBe(true);
    expect(isApiPathAllowedDuringPasswordChange("/api/me", "GET")).toBe(true);
    expect(isApiPathAllowedDuringPasswordChange("/api/campaigns", "GET")).toBe(false);
    expect(isApiPathAllowedDuringPasswordChange("/api/auth/sign-out", "POST")).toBe(true);
  });

  it("allows security and profile settings during 2FA enforcement", () => {
    expect(isApiPathAllowedDuringTwoFactorSetup("/api/account/security", "GET")).toBe(true);
    expect(isApiPathAllowedDuringTwoFactorSetup("/api/account/profile", "GET")).toBe(true);
    expect(isApiPathAllowedDuringTwoFactorSetup("/api/account/profile", "PATCH")).toBe(true);
    expect(isApiPathAllowedDuringTwoFactorSetup("/api/auth/two-factor/enable", "POST")).toBe(true);
    expect(isApiPathAllowedDuringTwoFactorSetup("/api/mail/inbox", "GET")).toBe(false);
    expect(isAppPathAllowedDuringTwoFactorSetup("/app/settings/security/")).toBe(true);
    expect(isAppPathAllowedDuringTwoFactorSetup("/app/settings/profile/")).toBe(true);
    expect(isAppPathAllowedDuringTwoFactorSetup("/app/campaigns/")).toBe(false);
  });

  it("routes sign-in to the two-factor page when Better Auth requests it", () => {
    expect(shouldRedirectToTwoFactor({ twoFactorRedirect: true })).toBe(true);
    expect(shouldRedirectToTwoFactor({ user: { id: "1" } })).toBe(false);
    expect(shouldRedirectToTwoFactor(null)).toBe(false);
    expect(twoFactorLoginPath("/app/inbox/")).toBe("/login/two-factor/?redirect=%2Fapp%2Finbox%2F");
  });
});

describe("security audit metadata", () => {
  it("drops sensitive fields", () => {
    expect(
      sanitizeAuditMetadata({
        email: "admin@example.com",
        password: "secret",
        token: "abc",
      }),
    ).toEqual({ email: "admin@example.com" });
  });
});

describe("transactional email redaction", () => {
  it("redacts tokens from console previews", () => {
    const text = "Verify: https://app.example/verify?token=super-secret-value";
    expect(redactAuthEmailText(text)).not.toContain("super-secret-value");
    expect(redactAuthEmailText(text)).toContain("[redacted]");
  });
});

describe("bootstrap preflight", () => {
  it("still refuses when another super-admin exists", () => {
    expect(
      bootstrapPreflight(
        [{ email: "other@example.com", role: "super-admin", banned: false }],
        "admin@example.com",
      ).action,
    ).toBe("refuse");
  });
});

describe("loadAccountSecurityState", () => {
  it("requires 2FA for super-admin after enforcement date", async () => {
    const db = {
      select: vi.fn(() => db),
      from: vi.fn(() => db),
      where: vi.fn(() => db),
      limit: vi.fn(async () => [
        {
          mustChangePassword: false,
          twoFactorEnabled: false,
          twoFactorEnforcementAfter: new Date(Date.now() - 60_000),
          role: "super-admin",
        },
      ]),
    };
    const state = await loadAccountSecurityState(db as never, "user_1");
    expect(state?.twoFactorEnforcementRequired).toBe(true);
    expect(state?.isSuperAdmin).toBe(true);
  });
});
