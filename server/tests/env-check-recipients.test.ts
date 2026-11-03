import { describe, expect, it } from "vitest";

import { mailboxCredentialsConfigured, parseTestRecipientsFromEnv } from "../mail/configuration.js";

describe("env:check mailbox recipient rules", () => {
  const mailbox = {
    SPACEMAIL_SMTP_HOST: "mail.spacemail.com",
    SPACEMAIL_SMTP_PORT: "587",
    SPACEMAIL_SMTP_SECURE: "false",
    SPACEMAIL_IMAP_HOST: "mail.spacemail.com",
    SPACEMAIL_IMAP_PORT: "993",
    SPACEMAIL_IMAP_SECURE: "true",
    SPACEMAIL_EMAIL: "mailbox@example.com",
    SPACEMAIL_PASSWORD: "secret",
  };

  it("accepts three recipients with mailbox credentials", () => {
    const values = {
      ...mailbox,
      SPACEMAIL_TEST_RECIPIENTS: "a@example.com,b@example.com,c@example.com",
    };
    expect(mailboxCredentialsConfigured(values)).toBe(true);
    expect(parseTestRecipientsFromEnv(values)).toEqual({
      ok: true,
      recipients: ["a@example.com", "b@example.com", "c@example.com"],
    });
  });
});
