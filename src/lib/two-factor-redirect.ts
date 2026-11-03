/**
 * Better Auth returns `{ twoFactorRedirect: true }` from sign-in when a TOTP
 * challenge is required. Callers must send the user to the 2FA page instead of
 * the app workspace.
 */
export function shouldRedirectToTwoFactor(data: unknown): boolean {
  return Boolean(data && typeof data === "object" && "twoFactorRedirect" in data && (data as { twoFactorRedirect?: boolean }).twoFactorRedirect);
}

export function twoFactorLoginPath(redirectTo: string) {
  return `/login/two-factor/?redirect=${encodeURIComponent(redirectTo)}`;
}
