import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const envelopes = vi.hoisted(() => [] as Array<{ envelope?: { to?: unknown }; raw?: Buffer }>);

vi.mock("nodemailer", async () => {
  const actual = await vi.importActual<typeof import("nodemailer")>("nodemailer");
  return {
    ...actual,
    createTransport(options: { streamTransport?: boolean }) {
      if (options?.streamTransport) return actual.createTransport(options);
      return {
        sendMail: async (mail: { envelope?: { to?: unknown }; raw?: Buffer }) => {
          envelopes.push(mail);
          const to = mail.envelope?.to;
          const accepted = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
          return { accepted, rejected: [], response: "250 OK" };
        },
        close() {},
      };
    },
  };
});

import type { MailConfig } from "../mail/configuration.js";
import { submitSingleRecipientMessage } from "../mail/smtp.js";

const config: MailConfig = {
  smtpHost: "smtp.invalid",
  smtpPort: 465,
  smtpSecure: true,
  imapHost: "imap.invalid",
  imapPort: 993,
  imapSecure: true,
  email: "sender@example.com",
  password: "secret",
  testRecipients: ["one@example.com", "two@example.com"],
  senderName: "Kivorenta",
};

function header(raw: string, name: string) {
  return raw.match(new RegExp(`^${name}:\\s*(.*)$`, "im"))?.[1]?.trim() ?? "";
}

describe("test message sent copies", () => {
  beforeEach(() => {
    envelopes.length = 0;
  });

  it("submits each recipient alone, with no Cc or Bcc and no second SMTP call", async () => {
    const first = await submitSingleRecipientMessage(config, {
      subject: "Test",
      text: "Hello one",
      html: "<p>Hello one</p>",
      to: "one@example.com",
    });
    const second = await submitSingleRecipientMessage(config, {
      subject: "Test",
      text: "Hello two",
      html: "<p>Hello two</p>",
      to: "two@example.com",
    });

    expect(envelopes).toHaveLength(2);
    expect(envelopes.map((entry) => entry.envelope?.to)).toEqual(["one@example.com", "two@example.com"]);
    expect(first.messageId).not.toBe(second.messageId);
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);

    for (const [index, entry] of envelopes.entries()) {
      const raw = entry.raw?.toString("utf8") ?? "";
      const recipient = index === 0 ? "one@example.com" : "two@example.com";
      const other = index === 0 ? "two@example.com" : "one@example.com";
      expect(header(raw, "To").toLowerCase()).toContain(recipient);
      expect(header(raw, "To").toLowerCase()).not.toContain(other);
      expect(header(raw, "Cc")).toBe("");
      expect(header(raw, "Bcc")).toBe("");
      expect(raw.toLowerCase()).not.toContain("list-unsubscribe");
      expect(String(entry.envelope?.to)).not.toContain(",");
    }
  });

  it("reuses the individual-send IMAP append and does not send again to populate Sent", () => {
    const files = {
      individual: readFileSync(new URL("../services/individual-send.ts", import.meta.url), "utf8"),
      single: readFileSync(new URL("../services/mail-test-send.ts", import.meta.url), "utf8"),
      list: readFileSync(new URL("../services/test-list-send.ts", import.meta.url), "utf8"),
    };
    for (const source of Object.values(files)) {
      expect(source).toContain('import { saveSentCopy } from "../mail/imap.js"');
      expect(source.match(/saveSentCopy\(/g)).toHaveLength(1);
    }
    expect(files.individual.match(/submitComposerMessage/g)?.length).toBeGreaterThan(0);
    expect(files.single.match(/submitAuthorizedMessage\(/g)).toHaveLength(1);
    expect(files.list.match(/submitSingleRecipientMessage\(/g)).toHaveLength(1);
    expect(files.list).not.toContain("submitComposerMessage");
    expect(files.single).not.toContain("cc:");
    expect(files.list).not.toContain("bcc:");
  });
});
