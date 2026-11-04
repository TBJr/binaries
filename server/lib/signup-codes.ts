import { createHash, randomBytes } from "node:crypto";

import type { SignupRoleKey } from "../auth/permissions.js";
import { SIGNUP_ROLE_KEYS } from "../auth/permissions.js";

export const SIGNUP_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isSignupRoleKey(role: string): role is SignupRoleKey {
  return (SIGNUP_ROLE_KEYS as readonly string[]).includes(role);
}

export function generateSignupCode() {
  return randomBytes(32).toString("base64url");
}

export function hashSignupCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function signupCodeStatus(
  code: { expiresAt: Date; usedAt: Date | null; revokedAt: Date | null },
  now = Date.now(),
) {
  if (code.revokedAt) return "revoked" as const;
  if (code.usedAt) return "used" as const;
  if (code.expiresAt.getTime() <= now) return "expired" as const;
  return "active" as const;
}
