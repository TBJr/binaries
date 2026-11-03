import { beforeEach, describe, expect, it, vi } from "vitest";

import { permissionForRequest } from "../auth/permissions.js";
import { categoryForAction, AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import { normalizePageViewPath, recordPageViewActivity } from "../services/page-view-activity.js";
import { recordAuthHandlerAudit } from "../services/auth-event-audit.js";
import { recordAccessDeniedAudit } from "../services/access-denied-audit.js";

vi.mock("../lib/session.js", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("../services/audit-log.js", () => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

import { getSessionUser } from "../lib/session.js";
import { recordAuditEvent } from "../services/audit-log.js";

describe("activity taxonomy", () => {
  it("maps page_viewed to ACTIVITY", () => {
    expect(categoryForAction(AUDIT_ACTIONS.pageViewed)).toBe("ACTIVITY");
  });
});

describe("page view path normalization", () => {
  it("accepts app-relative paths", () => {
    expect(normalizePageViewPath("/app/campaigns")).toBe("/app/campaigns");
    expect(normalizePageViewPath("/app/admin/users?q=a")).toBe("/app/admin/users?q=a");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(normalizePageViewPath("https://evil.example/x")).toBeNull();
    expect(normalizePageViewPath("//evil.example/x")).toBeNull();
    expect(normalizePageViewPath("javascript:alert(1)")).toBeNull();
  });
});

describe("recordPageViewActivity dedupe", () => {
  beforeEach(() => {
    vi.mocked(recordAuditEvent).mockClear();
  });

  it("inserts once then dedupes within the window", async () => {
    const inserts: unknown[] = [];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => (inserts.length > 0 ? [{ id: "existing" }] : []),
          }),
        }),
      }),
      insert: async () => undefined,
    };

    vi.mocked(recordAuditEvent).mockImplementation(async (_db, input) => {
      inserts.push(input);
    });

    const first = await recordPageViewActivity(db as never, {
      actorUserId: "user-1",
      actorEmail: "user@example.com",
      path: "/app/drafts",
    });
    const second = await recordPageViewActivity(db as never, {
      actorUserId: "user-1",
      actorEmail: "user@example.com",
      path: "/app/drafts",
    });

    expect(first).toEqual({ ok: true, deduped: false });
    expect(second).toEqual({ ok: true, deduped: true });
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordAuditEvent).mock.calls[0]?.[1]).toMatchObject({
      action: AUDIT_ACTIONS.pageViewed,
      category: "ACTIVITY",
      resourceId: "/app/drafts",
    });
  });
});

describe("auth sign-in audit for all roles", () => {
  beforeEach(() => {
    vi.mocked(recordAuditEvent).mockClear();
    vi.mocked(getSessionUser).mockReset();
  });

  it("records successful sign-in for a non-super-admin user", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      id: "user-editor",
      email: "editor@example.com",
      role: "editor",
    } as never);

    await recordAuthHandlerAudit({
      db: {} as never,
      path: "/api/auth/sign-in/email",
      method: "POST",
      status: 200,
      headers: new Headers(),
    });

    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordAuditEvent).mock.calls[0]?.[1]).toMatchObject({
      action: AUDIT_ACTIONS.authSignIn,
      actorUserId: "user-editor",
      result: "success",
    });
  });
});

describe("access denied audit", () => {
  beforeEach(() => {
    vi.mocked(recordAuditEvent).mockClear();
  });

  it("emits admin_access_denied", async () => {
    await recordAccessDeniedAudit({} as never, {
      actorUserId: "user-1",
      actorEmail: "user@example.com",
      permission: "users.read",
      path: "/api/admin/users",
      headers: new Headers(),
    });

    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordAuditEvent).mock.calls[0]?.[1]).toMatchObject({
      action: AUDIT_ACTIONS.adminAccessDenied,
      result: "failure",
      metadata: { path: "/api/admin/users", permission: "users.read" },
    });
  });
});

describe("activity route permissions", () => {
  it("does not require a fine-grained permission for page-view beacons", () => {
    expect(permissionForRequest("/api/activity/page-view", "POST")).toBeNull();
  });
});
