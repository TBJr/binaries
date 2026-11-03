import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { generateHTML, generateJSON } from "@tiptap/html";
import sanitizeHtml from "sanitize-html";

import {
  emailCtaComment,
  prepareTestSendHtml,
  validateEmailCtaPayload,
} from "./email-cta.js";

export const EMPTY_TIPTAP_DOC = {
  type: "doc",
  content: [{ type: "paragraph" }],
} as const;

export type TiptapDoc = Record<string, unknown>;

const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: false,
    defaultProtocol: "https",
    protocols: ["http", "https", "mailto"],
  }),
];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "h1",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {},
  allowProtocolRelative: false,
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: "a",
      attribs: {
        ...attribs,
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),
  },
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateTiptapDocument(
  value: unknown,
  limits = { maxDepth: 32, maxNodes: 5000 },
): TiptapDoc | null {
  if (!isPlainObject(value) || value.type !== "doc") {
    return null;
  }

  let nodeCount = 0;

  const walk = (node: unknown, depth: number): boolean => {
    if (depth > limits.maxDepth) return false;
    if (!isPlainObject(node) || typeof node.type !== "string") return false;
    nodeCount += 1;
    if (nodeCount > limits.maxNodes) return false;

    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) return false;
      for (const child of node.content) {
        if (!walk(child, depth + 1)) return false;
      }
    }

    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks)) return false;
      for (const mark of node.marks) {
        if (!isPlainObject(mark) || typeof mark.type !== "string") return false;
      }
    }

    if (node.attrs !== undefined && !isPlainObject(node.attrs)) {
      return false;
    }

    return true;
  };

  if (!walk(value, 0)) {
    return null;
  }

  return value;
}

export function normalizeTiptapDocument(value: unknown): TiptapDoc {
  const validated = validateTiptapDocument(value);
  return validated ?? { ...EMPTY_TIPTAP_DOC };
}

function blockNodeToHtml(node: unknown): string {
  if (!isPlainObject(node)) {
    return "";
  }
  if (node.type === "emailCtaButton") {
    const payload = validateEmailCtaPayload(node.attrs);
    return payload ? emailCtaComment(payload) : "";
  }
  return sanitizeEmailHtml(
    generateHTML({ type: "doc", content: [node] }, editorExtensions),
  );
}

export function tiptapJsonToHtml(doc: TiptapDoc): string {
  const normalized = normalizeTiptapDocument(doc);
  const blocks = Array.isArray(normalized.content) ? normalized.content : [];
  return blocks.map((block) => blockNodeToHtml(block)).join("");
}

function inlineContentToPlain(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  let text = "";
  for (const child of content) {
    if (!isPlainObject(child)) {
      continue;
    }
    if (child.type === "text" && typeof child.text === "string") {
      text += child.text;
    } else if (child.type === "hardBreak") {
      text += "\n";
    }
  }
  return text;
}

function blockNodeToPlain(node: unknown): string {
  if (!isPlainObject(node)) {
    return "";
  }
  if (node.type === "emailCtaButton") {
    const payload = validateEmailCtaPayload(node.attrs);
    return payload ? `${payload.label} (${payload.href})` : "";
  }
  if (node.type === "paragraph") {
    return inlineContentToPlain(node.content);
  }
  return htmlToPlainText(blockNodeToHtml(node));
}

export function tiptapJsonToPlainText(doc: TiptapDoc): string {
  const normalized = normalizeTiptapDocument(doc);
  const blocks = Array.isArray(normalized.content) ? normalized.content : [];
  return blocks
    .map((block) => blockNodeToPlain(block))
    .filter((block) => block.length > 0)
    .join("\n\n")
    .trim();
}

export function finalizeTestMessageHtml(html: string): string {
  return prepareTestSendHtml(html, sanitizeEmailHtml);
}

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim();
}

export function htmlToPlainText(html: string): string {
  const stripped = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  });
  return stripped
    .replace(/\u00a0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function processDraftContent(contentJson: unknown) {
  const normalized = normalizeTiptapDocument(contentJson);
  const bodyHtml = tiptapJsonToHtml(normalized);
  const bodyText = tiptapJsonToPlainText(normalized);
  return {
    contentJson: normalized,
    bodyHtml,
    bodyText,
  };
}

/** Parse sanitized HTML back to Tiptap JSON (server-side normalization). */
export function htmlToTiptapJson(html: string): TiptapDoc {
  const safe = sanitizeEmailHtml(html);
  if (!safe) {
    return { ...EMPTY_TIPTAP_DOC };
  }
  return generateJSON(safe, editorExtensions) as TiptapDoc;
}

export function estimateJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
