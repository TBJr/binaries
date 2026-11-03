import { describe, expect, it } from "vitest";

import { parseClientFromUserAgent } from "../lib/client-context.js";
import { auditRequestContextFromHeaders } from "../lib/request-context.js";
import { runWithAuditRequestContext, getAuditRequestContext } from "../lib/audit-request-context.js";
import { shouldAuditApiMutation } from "../services/api-mutation-audit.js";
import { recordAuditEvent } from "../services/audit-log.js";
import { categoryForAction, AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";

describe("parseClientFromUserAgent", () => {
  it("parses Chrome on macOS", () => {
    const client = parseClientFromUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    expect(client.browser).toMatch(/Chrome/i);
    expect(client.os).toMatch(/Mac/i);
    expect(client.deviceType).toBe("desktop");
  });

  it("parses Safari on iOS", () => {
    const client = parseClientFromUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    expect(client.browser).toMatch(/Safari/i);
    expect(client.os).toMatch(/iOS/i);
    expect(client.deviceType).toBe("mobile");
  });

  it("parses Edge on Windows", () => {
    const client = parseClientFromUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    );
    expect(client.browser).toMatch(/Edge/i);
    expect(client.os).toMatch(/Windows/i);
  });

  it("returns nulls for empty UA", () => {
    expect(parseClientFromUserAgent(null)).toEqual({
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      deviceType: null,
    });
  });
});

describe("auditRequestContextFromHeaders", () => {
  it("captures IP, UA, language, and request id", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
      "cf-ipcountry": "US",
    });
    const ctx = auditRequestContextFromHeaders(headers, "req-fixed");
    expect(ctx.ipAddress).toBe("203.0.113.10");
    expect(ctx.requestId).toBe("req-fixed");
    expect(ctx.acceptLanguage).toBe("en-US");
    expect(ctx.country).toBe("US");
    expect(ctx.client.browser).toMatch(/Chrome/i);
  });
});

describe("api mutation skip rules", () => {
  it("audits authenticated mutations and skips health/auth/page-view", () => {
    expect(shouldAuditApiMutation("POST", "/api/drafts")).toBe(true);
    expect(shouldAuditApiMutation("DELETE", "/api/campaigns/abc")).toBe(true);
    expect(shouldAuditApiMutation("GET", "/api/drafts")).toBe(false);
    expect(shouldAuditApiMutation("POST", "/api/health")).toBe(false);
    expect(shouldAuditApiMutation("POST", "/api/activity/page-view")).toBe(false);
    expect(shouldAuditApiMutation("POST", "/api/auth/sign-in/email")).toBe(false);
  });
});

describe("activity taxonomy", () => {
  it("maps api_mutation to ACTIVITY", () => {
    expect(categoryForAction(AUDIT_ACTIONS.apiMutation)).toBe("ACTIVITY");
    expect(categoryForAction(AUDIT_ACTIONS.campaignDeleted)).toBe("CAMPAIGN");
  });
});

describe("recordAuditEvent ALS merge", () => {
  it("fills IP and client metadata from ambient request context", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const db = {
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          inserted.push(row);
        },
      }),
    };

    const ambient = auditRequestContextFromHeaders(
      new Headers({
        "x-real-ip": "198.51.100.4",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        "accept-language": "de-DE",
      }),
      "als-req-1",
    );

    await runWithAuditRequestContext(ambient, async () => {
      expect(getAuditRequestContext()?.requestId).toBe("als-req-1");
      await recordAuditEvent(db as never, {
        action: "draft_created",
        actorUserId: "user-1",
        resourceType: "draft",
        resourceId: "d1",
      });
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.ipAddress).toBe("198.51.100.4");
    expect(inserted[0]?.requestId).toBe("als-req-1");
    expect(inserted[0]?.userAgent).toContain("Edg/");
    const metadata = inserted[0]?.metadata as Record<string, unknown>;
    expect(metadata.locale).toBe("de-DE");
    expect((metadata.client as { browser?: string }).browser).toMatch(/Edge/i);
  });
});
