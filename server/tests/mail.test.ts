import { describe, expect, it } from "vitest";

import { visibleDashboardNavGroups } from "../../src/lib/dashboard-nav.js";
import {
  assertAuthorizedParties,
  loadMailConfig,
  toPublicAccount,
} from "../mail/configuration.js";
import { friendlyMailError, redactSecrets } from "../mail/errors.js";
import { plainTextToSafeHtml, sanitizeInboundHtml } from "../mail/html.js";
import { messagePageRange } from "../mail/pagination.js";
import { assessTestSendRateLimit } from "../mail/rate-limit.js";
import { findSentMailbox } from "../mail/sent-folder.js";
import { queueEnvSchema } from "../queue/configuration.js";

const SECRET = "mailbox-secret-value";

function validEnv(overrides: Record<string, string> = {}) {
  return {
    SPACEMAIL_IMAP_HOST: "mail.spacemail.com",
    SPACEMAIL_IMAP_PORT: "993",
    SPACEMAIL_IMAP_SECURE: "true",
    SPACEMAIL_EMAIL: "mailbox@example.com",
    SPACEMAIL_PASSWORD: SECRET,
    RESEND_API_KEY: "re_test_key",
    RESEND_FROM_EMAIL: "sender@mail.example.com",
    SPACEMAIL_TEST_RECIPIENTS: "mailbox@example.com",
    SPACEMAIL_SENDER_NAME: "Binaries.nl",
    ...overrides,
  };
}

describe("mailbox configuration", () => {
  it("uses Resend SMTP and keeps Spacemail for incoming mailbox access", () => {
    const loaded = loadMailConfig(validEnv());
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.config.smtpHost).toBe("smtp.resend.com");
      expect(loaded.config.smtpPort).toBe(465);
      expect(loaded.config.smtpSecure).toBe(true);
      expect(loaded.config.imapHost).toBe("mail.spacemail.com");
      expect(loaded.config.fromEmail).toBe("sender@mail.example.com");
      expect(JSON.stringify(toPublicAccount(loaded.config))).not.toContain(SECRET);
      expect(JSON.stringify(toPublicAccount(loaded.config))).not.toContain("re_test_key");
    }
  });

  it("can send with Resend when Spacemail inbox credentials are absent", () => {
    const loaded = loadMailConfig(
      {
        RESEND_API_KEY: "re_test_key",
        RESEND_FROM_EMAIL: "sender@mail.example.com",
      },
      "resend",
    );
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.config.imapConfigured).toBe(false);
      expect(loaded.config.testRecipients).toEqual([]);
      expect(loaded.config.smtpHost).toBe("smtp.resend.com");
      expect(loaded.config.fromEmail).toBe("sender@mail.example.com");
    }
  });

  it("uses configured Spacemail SMTP settings when selected", () => {
    const loaded = loadMailConfig(
      {
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_USER: "mailbox@example.com",
        SMTP_PASS: "smtp-secret",
        SMTP_FROM: "sender@example.com",
        SPACEMAIL_TEST_RECIPIENTS: "test@example.com",
      },
      "spacemail",
    );
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.config.smtpHost).toBe("smtp.example.com");
      expect(loaded.config.smtpPort).toBe(587);
      expect(loaded.config.smtpUser).toBe("mailbox@example.com");
      expect(loaded.config.fromEmail).toBe("sender@example.com");
      expect(loaded.config.imapConfigured).toBe(false);
    }
  });

  it("requires the selected provider credentials but keeps invalid optional IMAP settings isolated", () => {
    expect(loadMailConfig(validEnv({ RESEND_API_KEY: "" })).ok).toBe(false);
    expect(loadMailConfig(validEnv({ SPACEMAIL_PASSWORD: "" })).ok).toBe(true);
    const wrongHost = loadMailConfig(validEnv({ SPACEMAIL_IMAP_HOST: "imap.example.com" }));
    expect(wrongHost.ok).toBe(true);
    if (wrongHost.ok) expect(wrongHost.config.imapConfigured).toBe(false);
    const wrongPort = loadMailConfig(validEnv({ SPACEMAIL_IMAP_PORT: "143", SPACEMAIL_IMAP_SECURE: "false" }));
    expect(wrongPort.ok).toBe(true);
    if (wrongPort.ok) expect(wrongPort.config.imapConfigured).toBe(false);
    expect(loadMailConfig(validEnv({ RESEND_API_KEY: "" }))).toEqual({ ok: false, reason: "missing" });
    expect(loadMailConfig(validEnv({ RESEND_FROM_EMAIL: "not-an-email" }))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("allows only the configured mailbox and authorized recipient", () => {
    const loaded = loadMailConfig(validEnv());
    if (!loaded.ok) throw new Error("expected config");
    expect(() =>
      assertAuthorizedParties(loaded.config, {
        from: loaded.config.fromEmail,
        to: loaded.config.testRecipients[0]!,
      }),
    ).not.toThrow();
    expect(() =>
      assertAuthorizedParties(loaded.config, {
        from: loaded.config.fromEmail,
        to: "other@example.com",
      }),
    ).toThrow(/authorized test recipient/);
    expect(() =>
      assertAuthorizedParties(loaded.config, {
        from: loaded.config.email,
        to: loaded.config.testRecipients[0]!,
      }),
    ).toThrow(/configured sender/);
  });
});

describe("mailbox safety", () => {
  it("redacts secrets and does not return them in friendly errors", () => {
    expect(redactSecrets(`login failed for ${SECRET}`, [SECRET])).toBe("login failed for [redacted]");
    const error = Object.assign(new Error(`authentication failed: ${SECRET}`), { code: "EAUTH" });
    const friendly = friendlyMailError(error, "smtp");
    expect(friendly).toMatch(/credentials/i);
    expect(friendly).not.toContain(SECRET);
  });

  it("linkifies safe URLs in plain-text test messages without allowing HTML injection", () => {
    const single = plainTextToSafeHtml("Visit https://example.com today.");
    expect(single).toContain('<a href="https://example.com"');
    expect(single).toContain("https://example.com</a> today.");
    expect(single).not.toContain("javascript:");

    const http = plainTextToSafeHtml("http://example.com");
    expect(http).toContain('href="http://example.com"');

    const query = plainTextToSafeHtml("https://example.com/path?x=1&y=2");
    expect(query).toContain('href="https://example.com/path?x=1&amp;y=2"');
    expect(query).toContain("https://example.com/path?x=1&amp;y=2</a>");

    const punct = plainTextToSafeHtml("See https://example.com).");
    expect(punct).toContain("https://example.com</a>).");

    const multi = plainTextToSafeHtml("https://a.example and https://b.example/end");
    expect(multi.match(/<a href="/g)?.length).toBe(2);

    const paragraphs = plainTextToSafeHtml("Line one https://example.com\n\nSecond https://example.org");
    expect(paragraphs).toContain("<p>Line one <a");
    expect(paragraphs).toContain("<p>Second <a");

    const escaped = plainTextToSafeHtml('<script>alert(1)</script><a href="javascript:alert(1)">bad</a>');
    expect(escaped).not.toContain("<script");
    expect(escaped).toContain("&lt;script&gt;");
    expect(escaped).not.toMatch(/<a\s+href="javascript:/i);
    expect(escaped).toContain('&lt;a href="javascript:alert(1)"&gt;');

    const unsupportedProtocol = plainTextToSafeHtml("Legacy ftp://example.com/file");
    expect(unsupportedProtocol).not.toContain('<a href="ftp:');

    const incomplete = plainTextToSafeHtml("broken link: https://");
    expect(incomplete).not.toContain("<a href=");

    const quoted = plainTextToSafeHtml('Say "https://example.com" loudly');
    expect(quoted).toContain('<a href="https://example.com"');

    const unicode = plainTextToSafeHtml("日本語 https://example.com テスト");
    expect(unicode).toContain("日本語 <a");
    expect(unicode).toContain("テスト");

    const mailto = plainTextToSafeHtml("Contact mailto:user@example.com please");
    expect(mailto).toContain('href="mailto:user@example.com"');
  });

  it("strips scripts, remote images, and unsafe links from message HTML", () => {
    const sanitized = sanitizeInboundHtml(
      '<p onclick="alert(1)">Hello</p><script>alert(1)</script><img src="https://tracker.example/pixel.gif"><a href="javascript:alert(1)">bad</a><a href="https://example.com">site</a>',
    );
    expect(sanitized).not.toContain("alert(1)");
    expect(sanitized).not.toContain("tracker.example");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).toContain("Hello");
    expect(sanitized).toContain("https://example.com");
  });

  it("limits test sends and finds a sent folder without assuming a copy already exists", () => {
    const now = new Date("2026-10-09T12:00:00.000Z");
    expect(
      assessTestSendRateLimit(
        [{ createdAt: new Date("2026-10-09T11:59:30.000Z") }],
        now,
      ).allowed,
    ).toBe(false);
    expect(
      assessTestSendRateLimit(
        [
          { createdAt: new Date("2026-10-09T11:10:00.000Z") },
          { createdAt: new Date("2026-10-09T11:30:00.000Z") },
          { createdAt: new Date("2026-10-09T11:50:00.000Z") },
        ],
        now,
      ).allowed,
    ).toBe(false);
    expect(assessTestSendRateLimit([], now).allowed).toBe(true);

    expect(
      findSentMailbox([
        { path: "INBOX", name: "INBOX", specialUse: "\\Inbox" },
        { path: "Sent", name: "Sent", specialUse: "\\Sent" },
      ])?.path,
    ).toBe("Sent");
    expect(findSentMailbox([{ path: "INBOX", name: "INBOX" }])).toBeNull();
  });

  it("pages newest messages first", () => {
    expect(messagePageRange(45, 1, 20)).toEqual({ start: 26, end: 45 });
    expect(messagePageRange(45, 3, 20)).toEqual({ start: 1, end: 5 });
    expect(messagePageRange(45, 4, 20)).toBeNull();
  });

  it("keeps campaign queue processing simulation-only", () => {
    const parsed = queueEnvSchema.safeParse({
      QUEUE_ENABLED: "true",
      QUEUE_SIMULATION_ONLY: "false",
      REDIS_URL: "redis://127.0.0.1:6379",
    });
    expect(parsed.success).toBe(false);
  });

  it("shows inbox and sent only for mailbox permission", () => {
    const adminTitles = visibleDashboardNavGroups(new Set(["mailbox.read", "users.read"])).flatMap((group) =>
      group.items.map((item) => item.title),
    );
    const userTitles = visibleDashboardNavGroups(new Set<string>()).flatMap((group) =>
      group.items.map((item) => item.title),
    );
    expect(adminTitles).toEqual(
      expect.arrayContaining(["Compose", "Inbox", "Sent", "Drafts", "Campaigns", "Queue", "Profile", "Mailbox"]),
    );
    expect(userTitles).not.toContain("Inbox");
    expect(userTitles).not.toContain("Sent");
    expect(userTitles).toContain("Drafts");
  });
});
