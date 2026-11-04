import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envelopes = vi.hoisted(
  () => [] as Array<{ envelope?: { from?: unknown; to?: unknown }; raw?: Buffer }>,
);
const resendRequests = vi.hoisted(() => [] as Array<{ url: string; init?: RequestInit }>);

vi.mock("nodemailer", async () => {
  const actual = await vi.importActual<typeof import("nodemailer")>("nodemailer");
  return {
    ...actual,
    createTransport(options: { streamTransport?: boolean }) {
      if (options?.streamTransport) return actual.createTransport(options);
      return {
        sendMail: async (mail: { envelope?: { from?: unknown; to?: unknown }; raw?: Buffer }) => {
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
  provider: "resend",
  smtpHost: "smtp.invalid",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "resend",
  smtpPassword: "re_test_key",
  imapHost: "imap.invalid",
  imapPort: 993,
  imapSecure: true,
  imapConfigured: true,
  email: "inbox@spacemail.example",
  password: "secret",
  resendApiKey: "re_test_key",
  fromEmail: "sender@send.example.com",
  testRecipients: ["one@example.com", "two@example.com"],
  senderName: "Kivorenta",
};

describe("test message sent copies", () => {
  beforeEach(() => {
    envelopes.length = 0;
    resendRequests.length = 0;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      resendRequests.push({ url: String(input), init });
      return Response.json({ id: `re_${resendRequests.length}` });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits each recipient separately through Resend without exposing other recipients", async () => {
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

    expect(envelopes).toHaveLength(0);
    expect(resendRequests).toHaveLength(2);
    expect(resendRequests.map((entry) => entry.url)).toEqual([
      "https://api.resend.com/emails",
      "https://api.resend.com/emails",
    ]);
    expect(first.messageId).not.toBe(second.messageId);
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);

    for (const [index, entry] of resendRequests.entries()) {
      const body = JSON.parse(String(entry.init?.body)) as {
        to: string[];
        cc?: string[];
        bcc?: string[];
        from: string;
        reply_to: string;
        headers: Record<string, string>;
      };
      const recipient = index === 0 ? "one@example.com" : "two@example.com";
      const other = index === 0 ? "two@example.com" : "one@example.com";
      expect(body.to).toEqual([recipient]);
      expect(JSON.stringify(body)).not.toContain(other);
      expect(body.cc).toBeUndefined();
      expect(body.bcc).toBeUndefined();
      expect(body.from).toContain("sender@send.example.com");
      expect(body.reply_to).toBe("inbox@spacemail.example");
      expect(body.headers["Message-ID"]).toBe(index === 0 ? first.messageId : second.messageId);
      expect(entry.init?.headers).toMatchObject({
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      });
      expect(entry.init?.headers).toHaveProperty("Idempotency-Key");
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
