import { UAParser } from "ua-parser-js";

export type ParsedClientContext = {
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  deviceType: string | null;
};

/** Parse browser / OS / device from a User-Agent string. Never claims MAC or hardware IDs. */
export function parseClientFromUserAgent(ua: string | null | undefined): ParsedClientContext {
  if (!ua?.trim()) {
    return {
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      deviceType: null,
    };
  }

  const parsed = new UAParser(ua.trim()).getResult();
  const browser = parsed.browser.name?.trim() || null;
  const browserVersion = parsed.browser.version?.trim() || null;
  const os = parsed.os.name?.trim() || null;
  const osVersion = parsed.os.version?.trim() || null;
  const deviceType = parsed.device.type?.trim() || (browser || os ? "desktop" : null);

  return {
    browser: browser ? browser.slice(0, 80) : null,
    browserVersion: browserVersion ? browserVersion.slice(0, 40) : null,
    os: os ? os.slice(0, 80) : null,
    osVersion: osVersion ? osVersion.slice(0, 40) : null,
    deviceType: deviceType ? deviceType.slice(0, 40) : null,
  };
}
