import { describe, expect, it } from "vitest";

import {
  EMPTY_TIPTAP_DOC,
  finalizeTestMessageHtml,
  htmlToPlainText,
  processDraftContent,
  sanitizeEmailHtml,
  tiptapJsonToHtml,
  tiptapJsonToPlainText,
  validateTiptapDocument,
} from "../lib/email-content.js";
import { renderEmailCtaButtonHtml, validateEmailCtaPayload } from "../lib/email-cta.js";
import { isAllowedEmailLinkUrl, normalizeEmailLinkUrl } from "../lib/safe-email-url.js";

describe("email content", () => {
  it("accepts a valid tiptap document", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello" }],
        },
      ],
    };
    expect(validateTiptapDocument(doc)).toEqual(doc);
  });

  it("rejects script payloads in generated html", () => {
    const malicious = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "<script>alert(1)</script>" }],
        },
      ],
    };
    const processed = processDraftContent(malicious);
    expect(processed.bodyHtml).not.toContain("<script");
    expect(sanitizeEmailHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
  });

  it("generates plain text from html", () => {
    const processed = processDraftContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Line one" }],
        },
      ],
    });
    expect(processed.bodyText).toContain("Line one");
    expect(htmlToPlainText("<p>Hello</p>")).toBe("Hello");
  });

  it("normalizes invalid documents to empty doc", () => {
    const processed = processDraftContent({ type: "invalid" });
    expect(processed.contentJson.type).toBe("doc");
    expect(EMPTY_TIPTAP_DOC.type).toBe("doc");
  });

  it("generates and preserves bullet list html", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "First" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Second" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(validateTiptapDocument(doc)).toEqual(doc);
    const html = tiptapJsonToHtml(doc);
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("First");
    expect(html).toContain("Second");
    const processed = processDraftContent(doc);
    expect(processed.bodyHtml).toContain("<ul");
    expect(processed.bodyHtml).toContain("<li");
    expect(processed.bodyText).toContain("First");
    expect(processed.bodyText).toContain("Second");
  });

  it("generates and preserves ordered list html", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Step one" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const html = tiptapJsonToHtml(doc);
    expect(html).toContain("<ol");
    expect(html).toContain("Step one");
    expect(sanitizeEmailHtml(html)).toContain("<ol");
  });

  it("validates safe link urls and rejects unsafe protocols", () => {
    expect(normalizeEmailLinkUrl("example.com")).toBe("https://example.com");
    expect(isAllowedEmailLinkUrl("https://example.com/path?x=1")).toBe(true);
    expect(isAllowedEmailLinkUrl("mailto:user@example.com")).toBe(true);
    expect(normalizeEmailLinkUrl("javascript:alert(1)")).toBe("");
    expect(normalizeEmailLinkUrl("data:text/html,test")).toBe("");
  });

  it("renders hyperlinks from tiptap link marks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Register Now",
              marks: [{ type: "link", attrs: { href: "https://example.com/register" } }],
            },
          ],
        },
      ],
    };
    const html = tiptapJsonToHtml(doc);
    expect(html).toContain('href="https://example.com/register"');
    expect(html).toContain("Register Now");
    expect(tiptapJsonToPlainText(doc)).toBe("Register Now");
  });

  it("renders cta placeholders and expands them for test send html", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello," }],
        },
        {
          type: "emailCtaButton",
          attrs: {
            label: "Complete Registration",
            href: "https://example.com/register",
            variant: "primary",
          },
        },
      ],
    };
    const draft = processDraftContent(doc);
    expect(draft.bodyHtml).toContain("<!--kivorenta-cta");
    expect(draft.bodyHtml).not.toContain("<table");
    expect(draft.bodyText).toContain("Complete Registration (https://example.com/register)");

    const delivered = finalizeTestMessageHtml(draft.bodyHtml);
    expect(delivered).toContain("<table");
    expect(delivered).toContain('href="https://example.com/register"');
    expect(delivered).toContain("Complete Registration");
    expect(delivered).not.toContain("<!--kivorenta-cta");
    expect(delivered).not.toContain("<script");
  });

  it("rejects invalid cta payloads", () => {
    expect(validateEmailCtaPayload({ label: "", href: "https://example.com" })).toBeNull();
    expect(validateEmailCtaPayload({ label: "Go", href: "javascript:alert(1)" })).toBeNull();
    expect(renderEmailCtaButtonHtml({ label: "Go", href: "https://example.com", variant: "primary" })).toContain(
      "bgcolor=\"#0d6e68\"",
    );
  });

  it("sanitizes list html without removing structure", () => {
    const safe = sanitizeEmailHtml(
      "<ul><li><p>Alpha</p></li><li><p>Beta</p></li></ul><ol><li><p>One</p></li></ol>",
    );
    expect(safe).toContain("<ul>");
    expect(safe).toContain("<ol>");
    expect(safe).toContain("Alpha");
    expect(safe).not.toContain("<script");
  });
});
