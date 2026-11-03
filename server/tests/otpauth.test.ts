import { describe, expect, it } from "vitest";

import { parseOtpAuthSecret } from "../../src/lib/otpauth.js";

describe("parseOtpAuthSecret", () => {
  it("extracts the secret from an otpauth URI", () => {
    const uri =
      "otpauth://totp/Kivorenta:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Kivorenta&algorithm=SHA1&digits=6&period=30";
    expect(parseOtpAuthSecret(uri)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("returns null for missing secret or non-otpauth URIs", () => {
    expect(parseOtpAuthSecret("otpauth://totp/App:user?issuer=App")).toBeNull();
    expect(parseOtpAuthSecret("https://example.com/?secret=ABC")).toBeNull();
    expect(parseOtpAuthSecret("not-a-url")).toBeNull();
  });
});
