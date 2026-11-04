import { describe, expect, it } from "vitest";

import {
  assertAllRecipientsAuthorized,
  assertAuthorizedParties,
  loadMailConfig,
} from "../mail/configuration.js";
import { parseTestRecipientsFromEnv } from "../mail/test-recipients.js";

const BASE_MAIL = {
  SPACEMAIL_IMAP_HOST: "mail.spacemail.com",
  SPACEMAIL_IMAP_PORT: "993",
  SPACEMAIL_IMAP_SECURE: "true",
  SPACEMAIL_EMAIL: "mailbox@example.com",
  SPACEMAIL_PASSWORD: "secret-value",
  RESEND_API_KEY: "re_test_key",
  RESEND_FROM_EMAIL: "sender@mail.example.com",
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

  it("prefers the generic MAIL_TEST_RECIPIENTS setting", () => {
    const result = parseTestRecipientsFromEnv({
      ...BASE_MAIL,
      MAIL_TEST_RECIPIENTS: "generic@example.com",
      SPACEMAIL_TEST_RECIPIENTS: "legacy@example.com",
    });
    expect(result).toEqual({ ok: true, recipients: ["generic@example.com"] });
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
        assertAuthorizedParties(loaded.config, { from: loaded.config.fromEmail, to }),
      ).not.toThrow();
    }
  });

  it("rejects a recipient not on the allowlist", () => {
    const loaded = loadMailConfig(envWithRecipients("first@example.com,second@example.com"));
    if (!loaded.ok) throw new Error("expected config");
    expect(() =>
      assertAuthorizedParties(loaded.config, {
        from: loaded.config.fromEmail,
        to: "other@example.com",
      }),
    ).toThrow(/authorized test recipient/);
  });

  it("rejects multi-recipient send when any address is unauthorized", () => {
    const loaded = loadMailConfig(envWithRecipients("first@example.com,second@example.com"));
    if (!loaded.ok) throw new Error("expected config");
    expect(() =>
      assertAllRecipientsAuthorized(loaded.config, {
        from: loaded.config.fromEmail,
        to: ["first@example.com", "other@example.com"],
      }),
    ).toThrow(/authorized test recipients/);
  });

  it("allows outbound mail without a test-recipient allowlist", () => {
    const loaded = loadMailConfig({ ...BASE_MAIL, SPACEMAIL_TEST_RECIPIENTS: "" });
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.config.testRecipients).toEqual([]);
  });
});
