import type { Context } from "hono";

type HeaderSource = {
  getSetCookie?: () => string[];
  get?: (name: string) => string | null;
};

/**
 * Forward Better Auth Set-Cookie headers onto a Hono response.
 * Uses append so multiple cookies (session + cache clears) are preserved.
 */
export function appendAuthSetCookies(c: Context, headers: HeaderSource | null | undefined) {
  if (!headers) return;
  const cookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : (() => {
          const single = headers.get?.("set-cookie");
          return single ? [single] : [];
        })();
  for (const cookie of cookies) {
    if (cookie) c.header("set-cookie", cookie, { append: true });
  }
}

/** Stable client copy for Better Auth change-password failures (no raw codes). */
export function mapChangePasswordError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (!message) return "Password change failed.";
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid password") || normalized.includes("invalid_password")) {
    return "Current password is incorrect.";
  }
  if (normalized.includes("compromised")) {
    return "That password has appeared in a data breach. Choose a different password.";
  }
  if (normalized.includes("database is temporarily unavailable") || normalized.includes("database_unavailable")) {
    return "The database is temporarily unavailable. Try again shortly.";
  }
  return "Password change failed.";
}
