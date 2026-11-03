import { describe, expect, it } from "vitest";

import {
  ORG_WORKSPACE_USER_ID,
  resolveRecipientOwnerId,
  resolveRecipientOwnerIdForUserId,
} from "../lib/org-workspace.js";

describe("resolveRecipientOwnerId", () => {
  it("maps super-admin actors to the shared workspace id", () => {
    expect(resolveRecipientOwnerId({ id: "sa-1", role: "super-admin" })).toBe(ORG_WORKSPACE_USER_ID);
    expect(resolveRecipientOwnerId({ id: "sa-2", role: "admin,super-admin" })).toBe(
      ORG_WORKSPACE_USER_ID,
    );
  });

  it("keeps non-super-admin actors on their own id", () => {
    expect(resolveRecipientOwnerId({ id: "editor-1", role: "editor" })).toBe("editor-1");
    expect(resolveRecipientOwnerId({ id: "admin-1", role: "admin" })).toBe("admin-1");
    expect(resolveRecipientOwnerId({ id: "user-1", role: null })).toBe("user-1");
  });
});

describe("resolveRecipientOwnerIdForUserId", () => {
  it("resolves from a looked-up role", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: "sa-9", role: "super-admin" }],
          }),
        }),
      }),
    };
    await expect(resolveRecipientOwnerIdForUserId(db as never, "sa-9")).resolves.toBe(
      ORG_WORKSPACE_USER_ID,
    );
  });

  it("returns the original id when the user is missing", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    };
    await expect(resolveRecipientOwnerIdForUserId(db as never, "ghost")).resolves.toBe("ghost");
  });
});

describe("shared pool ownership contract", () => {
  it("gives two super-admins the same owner id", () => {
    const a = resolveRecipientOwnerId({ id: "samuel", role: "super-admin" });
    const b = resolveRecipientOwnerId({ id: "thomas", role: "super-admin" });
    expect(a).toBe(b);
    expect(a).toBe(ORG_WORKSPACE_USER_ID);
  });

  it("does not let a regular user share the workspace owner", () => {
    const regular = resolveRecipientOwnerId({ id: "viewer-1", role: "viewer" });
    expect(regular).not.toBe(ORG_WORKSPACE_USER_ID);
  });
});
