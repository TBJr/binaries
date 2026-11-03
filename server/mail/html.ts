import sanitizeHtml from "sanitize-html";

const INBOUND_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "h1",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "pre",
    "code",
    "div",
    "span",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "hr",
  ],
  allowedAttributes: {
    a: ["href", "title"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    a: ["http", "https", "mailto"],
  },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a: (_tagName, attribs) => {
      const href = attribs.href ?? "";
      const allowed = /^(https?:|mailto:)/i.test(href);
      return {
        tagName: "a",
        attribs: {
          ...(allowed ? { href } : {}),
          ...(attribs.title ? { title: attribs.title } : {}),
          rel: "noopener noreferrer",
          target: "_blank",
        },
      };
    },
  },
};

export function sanitizeInboundHtml(html: string) {
  return sanitizeHtml(html, INBOUND_SANITIZE_OPTIONS).trim();
}

const AUTO_LINK_PATTERN = /(?:https?:\/\/|mailto:)[^\s<>"']+/gi;

function escapeHtmlText(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(text: string) {
  return escapeHtmlText(text).replace(/"/g, "&quot;");
}

function peelTrailingPunctuation(raw: string) {
  let core = raw;
  let trailing = "";
  while (core.length > 0) {
    const ch = core.at(-1)!;
    if (ch === ")") {
      const opens = (core.match(/\(/g) ?? []).length;
      const closes = (core.match(/\)/g) ?? []).length;
      if (closes > opens) {
        core = core.slice(0, -1);
        trailing = ch + trailing;
        continue;
      }
    }
    if (/[.,;:!?]/.test(ch)) {
      core = core.slice(0, -1);
      trailing = ch + trailing;
      continue;
    }
    break;
  }
  return { core, trailing };
}

function isSafeHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeMailtoUrl(url: string) {
  if (!/^mailto:/i.test(url)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "mailto:") {
      return false;
    }
    const address = parsed.pathname;
    if (!address || /[\s<>"]/.test(address)) {
      return false;
    }
    return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address);
  } catch {
    return false;
  }
}

function isSafeLinkUrl(url: string) {
  return isSafeHttpUrl(url) || isSafeMailtoUrl(url);
}

function linkifyPlainText(text: string) {
  let result = "";
  let lastIndex = 0;
  for (const match of text.matchAll(AUTO_LINK_PATTERN)) {
    const index = match.index ?? 0;
    result += escapeHtmlText(text.slice(lastIndex, index));
    const raw = match[0];
    const { core, trailing } = peelTrailingPunctuation(raw);
    if (isSafeLinkUrl(core)) {
      result += `<a href="${escapeHtmlAttr(core)}">${escapeHtmlText(core)}</a>`;
      result += escapeHtmlText(trailing);
    } else {
      result += escapeHtmlText(raw);
    }
    lastIndex = index + raw.length;
  }
  result += escapeHtmlText(text.slice(lastIndex));
  return result;
}

export function plainTextToSafeHtml(text: string) {
  const body = text
    .split(/\n{2,}/)
    .map((block) => `<p>${linkifyPlainText(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
  return sanitizeInboundHtml(body);
}
