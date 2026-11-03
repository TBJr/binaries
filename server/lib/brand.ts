const DEFAULT_APP_NAME = "Binaries.nl";
const DEFAULT_COMPANY_NAME = "Binaries.nl";

export function getAppName(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.APP_NAME?.trim();
  return value || DEFAULT_APP_NAME;
}

export function getCompanyName(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.APP_COMPANY_NAME?.trim();
  return value || DEFAULT_COMPANY_NAME;
}

/** Stable API service identifier (not the marketing product name). */
export function getApiServiceId(env: NodeJS.ProcessEnv = process.env): string {
  const slug = getAppName(env)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}-api` : "kivorenta-api";
}

export function accessDeniedMessage(env: NodeJS.ProcessEnv = process.env): string {
  return `This account cannot access ${getAppName(env)}.`;
}
