import { beforeEach, describe, expect, it, vi } from "vitest";

const deliveries = vi.hoisted(
  () => ({
    transports: [] as Array<Record<string, unknown>>,
    messages: [] as Array<Record<string, unknown>>,
  }),
);

vi.mock("nodemailer", () => ({
  createTransport(options: Record<string, unknown>) {
    deliveries.transports.push(options);
    return {
      async sendMail(message: Record<string, unknown>) {
        deliveries.messages.push(message);
      },
      close() {},
    };
  },
}));

import type { ServerEnv } from "../env.js";
import { sendTransactionalEmail } from "../lib/email.js";

const env: ServerEnv = {
  NODE_ENV: "test",
  APP_NAME: "Kivorenta",
  APP_COMPANY_NAME: "Kivorenta",
  DATABASE_URL: "postgresql://localhost/kivorenta",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:5173",
  FRONTEND_URL: "http://localhost:5173",
  PORT: 3001,
  AUTH_EMAIL_DELIVERY: "resend",
  RESEND_API_KEY: "re_test_key",
  RESEND_FROM_EMAIL: "no-reply@mail.example.com",
};

describe("Resend transactional email", () => {
  beforeEach(() => {
    deliveries.transports.length = 0;
    deliveries.messages.length = 0;
  });

  it("uses Resend SMTP and the verified sender address", async () => {
    await expect(
      sendTransactionalEmail(env, {
        to: "user@example.com",
        subject: "Verify your account",
        text: "Verify your account.",
      }),
    ).resolves.toEqual({ delivered: true });

    expect(deliveries.transports[0]).toMatchObject({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: { user: "resend", pass: "re_test_key" },
    });
    expect(deliveries.messages[0]).toMatchObject({
      from: "no-reply@mail.example.com",
      to: "user@example.com",
    });
  });

  it("fails explicitly when Resend credentials or sender are missing", async () => {
    await expect(
      sendTransactionalEmail({ ...env, RESEND_API_KEY: undefined }, {
        to: "user@example.com",
        subject: "Verify your account",
        text: "Verify your account.",
      }),
    ).rejects.toThrow(/RESEND_API_KEY or RESEND_FROM_EMAIL is missing/);
  });
});
