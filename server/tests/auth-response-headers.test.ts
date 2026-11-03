import { describe, expect, it, vi } from "vitest";

import { appendAuthSetCookies, mapChangePasswordError } from "../lib/auth-response-headers.js";

function mockContext() {
  const cookies: string[] = [];
  return {
    cookies,
    c: {
      header: vi.fn((name: string, value: string, options?: { append?: boolean }) => {
        if (name.toLowerCase() === "set-cookie") {
          if (options?.append) cookies.push(value);
          else cookies.splice(0, cookies.length, value);
        }
      }),
    },
  };
}

describe("appendAuthSetCookies", () => {
  it("appends each Set-Cookie from getSetCookie", () => {
    const { c, cookies } = mockContext();
    const headers = {
      getSetCookie: () => [
        "session=abc; Path=/; HttpOnly",
        "session_data=xyz; Path=/; HttpOnly",
      ],
    };

    appendAuthSetCookies(c as never, headers);

    expect(c.header).toHaveBeenCalledTimes(2);
    expect(cookies).toEqual([
      "session=abc; Path=/; HttpOnly",
      "session_data=xyz; Path=/; HttpOnly",
    ]);
    expect(c.header).toHaveBeenCalledWith("set-cookie", "session=abc; Path=/; HttpOnly", { append: true });
  });

  it("falls back to a single set-cookie header when getSetCookie is unavailable", () => {
    const { c, cookies } = mockContext();
    const headers = {
      get: (name: string) => (name === "set-cookie" ? "session=only; Path=/" : null),
    };

    appendAuthSetCookies(c as never, headers);

    expect(cookies).toEqual(["session=only; Path=/"]);
  });

  it("no-ops when headers are missing or empty", () => {
    const { c, cookies } = mockContext();
    appendAuthSetCookies(c as never, null);
    appendAuthSetCookies(c as never, undefined);
    appendAuthSetCookies(c as never, { getSetCookie: () => [] });
    expect(c.header).not.toHaveBeenCalled();
    expect(cookies).toEqual([]);
  });
});

describe("mapChangePasswordError", () => {
  it("maps known Better Auth failures to stable copy", () => {
    expect(mapChangePasswordError(new Error("Invalid password"))).toBe("Current password is incorrect.");
    expect(mapChangePasswordError(new Error("PASSWORD_COMPROMISED"))).toBe(
      "That password has appeared in a data breach. Choose a different password.",
    );
    expect(mapChangePasswordError(new Error("database_unavailable"))).toBe(
      "The database is temporarily unavailable. Try again shortly.",
    );
  });

  it("hides unexpected failures", () => {
    expect(mapChangePasswordError(new Error("stack trace / secret"))).toBe("Password change failed.");
    expect(mapChangePasswordError("not-an-error")).toBe("Password change failed.");
  });
});
