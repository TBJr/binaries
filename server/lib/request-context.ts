import type { Context } from "hono";

import { parseClientFromUserAgent, type ParsedClientContext } from "./client-context.js";

export type FullAuditRequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
  acceptLanguage: string | null;
  country: string | null;
  client: ParsedClientContext;
};

export function clientIpFromRequest(c: Context): string | null {
  return clientIpFromHeaders(c.req.raw.headers);
}

export function userAgentFromRequest(c: Context): string | null {
  return userAgentFromHeaders(c.req.raw.headers);
}

export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 128);
  return null;
}

export function userAgentFromHeaders(headers: Headers): string | null {
  const ua = headers.get("user-agent")?.trim();
  return ua ? ua.slice(0, 512) : null;
}

function acceptLanguageFromHeaders(headers: Headers): string | null {
  const raw = headers.get("accept-language")?.trim();
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first ? first.slice(0, 64) : null;
}

/** Build full request context for audit rows (IP, UA, language, CDN hints, parsed client). */
export function auditRequestContextFromHeaders(
  headers: Headers,
  requestId = crypto.randomUUID(),
): FullAuditRequestContext {
  const userAgent = userAgentFromHeaders(headers);
  const country = headers.get("cf-ipcountry")?.trim()?.slice(0, 16) || null;
  return {
    ipAddress: clientIpFromHeaders(headers),
    userAgent,
    requestId,
    acceptLanguage: acceptLanguageFromHeaders(headers),
    country,
    client: parseClientFromUserAgent(userAgent),
  };
}
