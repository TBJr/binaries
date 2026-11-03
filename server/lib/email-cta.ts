import { isAllowedEmailLinkUrl, normalizeEmailLinkUrl } from "./safe-email-url.js";

export type EmailCtaVariant = "primary" | "secondary";

export type EmailCtaPayload = {
  href: string;
  label: string;
  variant: EmailCtaVariant;
};

const PRIMARY_BG = "#0d6e68";
const PRIMARY_TEXT = "#ffffff";
const SECONDARY_BG = "#f3f4f6";
const SECONDARY_TEXT = "#0d6e68";
const SECONDARY_BORDER = "#d1d5db";

export const CTA_COMMENT_PATTERN = /<!--kivorenta-cta\s+(\{[^}]+\})\s*-->/g;

function escapeHtmlText(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(text: string) {
  return escapeHtmlText(text).replace(/"/g, "&quot;");
}

export function validateEmailCtaPayload(value: unknown): EmailCtaPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const variant = record.variant === "secondary" ? "secondary" : "primary";
  const href = normalizeEmailLinkUrl(typeof record.href === "string" ? record.href : "");
  if (!href || !label || label.length > 120) {
    return null;
  }
  if (!isAllowedEmailLinkUrl(href)) {
    return null;
  }
  return { href, label, variant };
}

export function emailCtaComment(payload: EmailCtaPayload) {
  return `<!--kivorenta-cta ${JSON.stringify(payload)}-->`;
}

export function renderEmailCtaButtonHtml(payload: EmailCtaPayload) {
  const isPrimary = payload.variant === "primary";
  const background = isPrimary ? PRIMARY_BG : SECONDARY_BG;
  const color = isPrimary ? PRIMARY_TEXT : SECONDARY_TEXT;
  const border = isPrimary ? "0" : `1px solid ${SECONDARY_BORDER}`;
  const safeHref = escapeHtmlAttr(payload.href);
  const safeLabel = escapeHtmlText(payload.label);

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${background}" style="border-radius:6px;border:${border};"><a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:${color};text-decoration:none;">${safeLabel}</a></td></tr></table>`;
}

export function prepareTestSendHtml(html: string, sanitizeRichText: (chunk: string) => string) {
  const parts: string[] = [];
  let lastIndex = 0;
  for (const match of html.matchAll(CTA_COMMENT_PATTERN)) {
    const index = match.index ?? 0;
    parts.push(sanitizeRichText(html.slice(lastIndex, index)));
    const payload = validateEmailCtaPayload(JSON.parse(match[1]!) as unknown);
    if (payload) {
      parts.push(renderEmailCtaButtonHtml(payload));
    }
    lastIndex = index + match[0].length;
  }
  parts.push(sanitizeRichText(html.slice(lastIndex)));
  return parts.join("").trim();
}
