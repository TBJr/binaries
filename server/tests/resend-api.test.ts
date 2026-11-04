import { afterEach, describe, expect, it, vi } from "vitest";

import { sendResendEmail } from "../mail/resend.js";
import { MailboxError } from "../mail/errors.js";

describe("Resend API delivery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a bounded HTTPS request and sends the stable idempotency key", async () => {
    let request: RequestInit | undefined;
    vi.stubGlobal("fetch", async (_input: string | URL | Request, init?: RequestInit) => {
      request = init;
      return Response.json({ id: "re_123" });
    });

    await expect(
      sendResendEmail(
        "re_test_key",
        {
          from: "Binaries <sender@example.com>",
          to: ["recipient@example.com"],
          subject: "Test",
          text: "Hello",
        },
        "submission-123",
      ),
    ).resolves.toEqual({ accepted: true, id: "re_123" });

    expect(request?.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Idempotency-Key": "submission-123",
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns explicit provider rejection for client errors", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 422 }));
    await expect(
      sendResendEmail("re_test_key", {
        from: "sender@example.com",
        to: ["recipient@example.com"],
        subject: "Test",
        text: "Hello",
      }),
    ).resolves.toEqual({
      accepted: false,
      response: "Resend rejected the message (HTTP 422).",
    });
  });

  it("marks timeouts and server errors as uncertain, not as safe-to-retry failures", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }));
    await expect(
      sendResendEmail("re_test_key", {
        from: "sender@example.com",
        to: ["recipient@example.com"],
        subject: "Test",
        text: "Hello",
      }),
    ).rejects.toMatchObject({ code: "SMTP_UNCERTAIN" });

    vi.stubGlobal("fetch", async () => {
      throw new DOMException("The operation timed out", "TimeoutError");
    });
    await expect(
      sendResendEmail("re_test_key", {
        from: "sender@example.com",
        to: ["recipient@example.com"],
        subject: "Test",
        text: "Hello",
      }),
    ).rejects.toBeInstanceOf(MailboxError);
  });
});
