/**
 * Extract the TOTP secret from an otpauth:// URI for manual authenticator entry.
 */
export function parseOtpAuthSecret(totpUri: string): string | null {
  if (!totpUri.startsWith("otpauth:")) return null;
  try {
    const url = new URL(totpUri);
    const secret = url.searchParams.get("secret");
    return secret && secret.length > 0 ? secret : null;
  } catch {
    return null;
  }
}
