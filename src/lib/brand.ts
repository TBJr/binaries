export const APP_NAME = "Binaries.nl";
export const APP_TAGLINE = "Email, Organized.";
export const APP_COMPANY = "Binaries.nl";

export function appPageTitle(page: string): string {
  return `${page} | ${APP_NAME}`;
}

/** Public site origin for canonical URLs (set VITE_APP_URL in production). */
export function publicSiteOrigin(): string {
  const raw = import.meta.env.VITE_APP_URL;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim().replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

export function canonicalHref(path: string): string {
  const origin = publicSiteOrigin();
  return origin ? `${origin}${path}` : path;
}

export const contactEmail =
  typeof import.meta.env.VITE_CONTACT_EMAIL === "string" && import.meta.env.VITE_CONTACT_EMAIL.trim()
    ? import.meta.env.VITE_CONTACT_EMAIL.trim()
    : "";
