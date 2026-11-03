import { randomBytes } from "node:crypto";

import { validatePassword } from "./password-policy.js";

/** At least 24 bytes of entropy, URL-safe (no whitespace). */
export function generateTemporaryPassword(): string {
  return randomBytes(32).toString("base64url");
}

export function validateBootstrapPassword(password: string): string | null {
  return validatePassword(password);
}

export function resolveBootstrapPassword(env: NodeJS.ProcessEnv = process.env): {
  password: string;
  generated: boolean;
  error: string | null;
} {
  const fromEnv = env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  if (fromEnv) {
    const error = validateBootstrapPassword(fromEnv);
    if (error) {
      return { password: "", generated: false, error };
    }
    return { password: fromEnv, generated: false, error: null };
  }
  return { password: generateTemporaryPassword(), generated: true, error: null };
}
