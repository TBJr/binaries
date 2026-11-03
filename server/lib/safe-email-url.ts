const BLOCKED_PROTOCOL_PATTERN = /^(javascript|data|file|vbscript):/i;

export function isAllowedEmailLinkUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || BLOCKED_PROTOCOL_PATTERN.test(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

export function normalizeEmailLinkUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const withProtocol =
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:")
      ? trimmed
      : `https://${trimmed}`;
  return isAllowedEmailLinkUrl(withProtocol) ? withProtocol : "";
}
