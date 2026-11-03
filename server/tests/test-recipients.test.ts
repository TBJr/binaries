import { describe, expect, it } from "vitest";

import {
  assertAllRecipientsAuthorized,
  assertAuthorizedParties,
  loadMailConfig,
} from "../mail/configuration.js";
import { parseTestRecipientsFromEnv } from "../mail/test-recipients.js";

const BASE_MAIL = {
  SPACEMAIL_SMTP_HOST: "mail.spacemail.com",
  SPACEMAIL_SMTP_PORT: "587",
  SPACEMAIL_SMTP_SECURE: "false",
  SPACEMAIL_IMAP_HOST: "mail.spacemail.com",
  SPACEMAIL_IMAP_PORT: "993",
  SPACEMAIL_IMAP_SECURE: "true",
  SPACEMAIL_EMAIL: "mailbox@example.com",
  SPACEMAIL_PASSWORD: "secret-value",
};

function envWithRecipients(value: string, legacy?: string) {
  return {
    ...BASE_MAIL,
    SPACEMAIL_TEST_RECIPIENTS: value,
    ...(legacy !== undefined ? { SPACEMAIL_TEST_RECIPIENT: legacy } : {}),
  };
}

describe("parseTestRecipientsFromEnv", () => {
  it("parses one recipient", () => {
    const result = parseTestRecipientsFromEnv(envWithRecipients("one@example.com"));
    expect(result).toEqual({ ok: true, recipients: ["one@example.com"] });
  });

  it("parses three authorized recipients", () => {
    const result = parseTestRecipientsFromEnv(
      envWithRecipients("a@example.com,b@example.com,c@example.com"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recipients).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
    }
  });

  it("parses more than three recipients", () => {
    const result = parseTestRecipientsFromEnv(
      envWithRecipients("a@example.com,b@example.com,c@example.com,d@example.com"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recipients).toHaveLength(4);
  });

  it("trims whitespace around comma-separated addresses", () => {
    const result = parseTestRecipientsFromEnv(
      envWithRecipients(" a@example.com , b@example.com , c@example.com "),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recipients).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
    }
  });

  it("deduplicates duplicate addresses", () => {
    const result = parseTestRecipientsFromEnv(
      envWithRecipients("a@example.com,a@example.com,b@example.com"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recipients).toEqual(["a@example.com", "b@example.com"]);
  });

  it("compares recipients case-insensitively", () => {
    const result = parseTestRecipientsFromEnv(envWithRecipients("A@Example.COM,b@example.com"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recipients).toEqual(["a@example.com", "b@example.com"]);
  });

  it("rejects invalid email syntax", () => {
    expect(parseTestRecipientsFromEnv(envWithRecipients("not-an-email"))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects empty plural configuration", () => {
    expect(parseTestRecipientsFromEnv(envWithRecipients("  ,  , "))).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("supports legacy SPACEMAIL_TEST_RECIPIENT", () => {
    const result = parseTestRecipientsFromEnv({
      ...BASE_MAIL,
      SPACEMAIL_TEST_RECIPIENT: "legacy@example.com",
    });
    expect(result).toEqual({ ok: true, recipients: ["legacy@example.com"] });
  });

  it("prefers SPACEMAIL_TEST_RECIPIENTS when both variables exist", () => {
    const result = parseTestRecipientsFromEnv(
      envWithRecipients("plural@example.com", "legacy@example.com"),
    );
    expect(result).toEqual({ ok: true, recipients: ["plural@example.com"] });
  });
});

describe("recipient authorization", () => {
  it("allows authorized first, second, and third recipients", () => {
    const loaded = loadMailConfig(
      envWithRecipients("first@example.com,second@example.com,third@example.com"),
    );
    if (!loaded.ok) throw new Error("expected config");
    for (const to of loaded.config.testRecipients) {
      expect(() =>
        assertAuthorizedParties(loaded.config, { from: loaded.config.email, to }),
      ).not.toThrow();
    }
  });

  it("rejects a recipient not on the allowlist", () => {
    const loaded = loadMailConfig(envWithRecipients("first@example.com,second@example.com"));
    if (!loaded.ok) throw new Error("expected config");
    expect(() =>
      assertAuthorizedParties(loaded.config, {
        from: loaded.config.email,
        to: "other@example.com",
      }),
    ).toThrow(/authorized test recipient/);
  });

  it("rejects multi-recipient send when any address is unauthorized", () => {
    const loaded = loadMailConfig(envWithRecipients("first@example.com,second@example.com"));
    if (!loaded.ok) throw new Error("expected config");
    expect(() =>
      assertAllRecipientsAuthorized(loaded.config, {
        from: loaded.config.email,
        to: ["first@example.com", "other@example.com"],
      }),
    ).toThrow(/authorized test recipients/);
  });

  it("loadMailConfig fails when recipients are missing", () => {
    expect(loadMailConfig({ ...BASE_MAIL })).toEqual({ ok: false, reason: "recipients" });
  });
});
