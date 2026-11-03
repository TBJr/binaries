import { describe, expect, it } from "vitest";

import { permissionForRequest, PERMISSIONS } from "../auth/permissions.js";
import { createHash } from "node:crypto";
import {
  canDirectlyCreatePasswordAccount,
  customRoleKeyError,
  invalidPermissionKeys,
  roleGrantError,
  superAdminRemovalAllowed,
  userCreatedAuditMetadata,
  userDeleteDecision,
} from "../auth/policy.js";
import { adminSetPasswordAuditMetadata } from "../services/admin.js";
import { adminSetPasswordSchema, createUserSchema } from "../validation/admin-users.js";
import { queueEnvSchema } from "../queue/configuration.js";

describe("admin authorization", () => {
  it("rejects removing the last active super admin", () => {
    expect(superAdminRemovalAllowed({
      activeSuperAdmins: 1,
      targetIsActiveSuperAdmin: true,
      nextIncludesSuperAdmin: false,
    })).toBe(false);
    expect(superAdminRemovalAllowed({
      activeSuperAdmins: 2,
      targetIsActiveSuperAdmin: true,
      nextIncludesSuperAdmin: false,
    })).toBe(true);
  });

  it("blocks privilege escalation and self-promotion to super-admin", () => {
    const error = roleGrantError({
      actorIsSuperAdmin: false,
      actorPermissions: new Set(["campaigns.read"]),
      nextRoleKeys: ["editor"],
      rolePermissions: { editor: ["drafts.update", "campaigns.read"] },
      actorId: "actor",
      targetId: "target",
      activeSuperAdmins: 1,
      targetIsActiveSuperAdmin: false,
    });
    expect(error).toMatch(/permissions you do not have/);
    expect(roleGrantError({
      actorIsSuperAdmin: false,
      actorPermissions: new Set(PERMISSIONS),
      nextRoleKeys: ["super-admin"],
      rolePermissions: { "super-admin": PERMISSIONS },
      actorId: "actor",
      targetId: "target",
      activeSuperAdmins: 1,
      targetIsActiveSuperAdmin: false,
    })).toMatch(/Only a super admin/);
  });

  it("protects reserved role keys and unknown permissions", () => {
    expect(customRoleKeyError("super-admin")).toMatch(/reserved/);
    expect(customRoleKeyError("billing-admin")).toBeNull();
    expect(invalidPermissionKeys(["campaigns.read", "nope.permission"])).toEqual(["nope.permission"]);
  });

  it("maps mailbox and user routes to permissions", () => {
    expect(permissionForRequest("/api/mail/inbox", "GET")).toBe("mailbox.read");
    expect(permissionForRequest("/api/mail/test-send", "POST")).toBe("mailbox.send_test");
    expect(permissionForRequest("/api/admin/users", "GET")).toBe("users.read");
    expect(permissionForRequest("/api/admin/users", "POST")).toBe("users.create");
    expect(permissionForRequest("/api/admin/users/invite", "POST")).toBe("users.invite");
    expect(permissionForRequest("/api/admin/users/user-1/password", "POST")).toBe("users.update");
    expect(permissionForRequest("/api/admin/users/user-1/password-reset", "POST")).toBe("users.reset_password");
    expect(permissionForRequest("/api/admin/users/user-1", "DELETE")).toBe("users.delete");
    expect(permissionForRequest("/api/admin/audit", "GET")).toBe("audit.read");
    expect(permissionForRequest("/api/drafts", "GET")).toBe("drafts.read");
  });

  it("decides permanent user deletion without touching the database", () => {
    expect(
      userDeleteDecision({
        actorId: "actor",
        targetId: "target",
        targetExists: true,
        activeSuperAdmins: 2,
        targetIsActiveSuperAdmin: false,
      }),
    ).toEqual({ ok: true });

    expect(
      userDeleteDecision({
        actorId: "actor",
        targetId: "actor",
        targetExists: true,
        activeSuperAdmins: 2,
        targetIsActiveSuperAdmin: false,
      }),
    ).toMatchObject({ ok: false, status: 403, error: "You cannot delete your own account." });

    expect(
      userDeleteDecision({
        actorId: "actor",
        targetId: null,
        targetExists: false,
        activeSuperAdmins: 1,
        targetIsActiveSuperAdmin: false,
      }),
    ).toMatchObject({ ok: false, status: 404, error: "User not found" });

    expect(
      userDeleteDecision({
        actorId: "actor",
        targetId: "last-super",
        targetExists: true,
        activeSuperAdmins: 1,
        targetIsActiveSuperAdmin: true,
      }),
    ).toMatchObject({ ok: false, status: 403, error: "The last active super admin cannot be deleted." });

    expect(
      userDeleteDecision({
        actorId: "actor",
        targetId: "other-super",
        targetExists: true,
        activeSuperAdmins: 2,
        targetIsActiveSuperAdmin: true,
      }),
    ).toEqual({ ok: true });
  });

  it("stores only a hash of an invitation token", () => {
    const token = "invite-token-value";
    const hash = createHash("sha256").update(token).digest("hex");
    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64);
  });

  it("restricts direct password creation to super admins and omits passwords from audit data", () => {
    expect(canDirectlyCreatePasswordAccount("super-admin")).toBe(true);
    expect(canDirectlyCreatePasswordAccount("admin")).toBe(false);
    expect(canDirectlyCreatePasswordAccount(null)).toBe(false);
    const metadata = userCreatedAuditMetadata({ roles: ["viewer"], status: "active", verificationEmail: "not_sent" });
    expect(JSON.stringify(metadata)).not.toMatch(/password/i);
    const mismatch = createUserSchema.safeParse({
      name: "Example User",
      email: "user@example.com",
      password: "long-enough-password",
      confirmPassword: "different-password",
      roleIds: ["role_user"],
      status: "active",
    });
    expect(mismatch.success).toBe(false);
    const weak = createUserSchema.safeParse({
      name: "Example User",
      email: "user@example.com",
      password: "short",
      confirmPassword: "short",
      roleIds: ["role_user"],
      status: "active",
    });
    expect(weak.success).toBe(false);
  });

  it("validates admin password set without storing password values in audit metadata", () => {
    expect(canDirectlyCreatePasswordAccount("super-admin")).toBe(true);
    expect(canDirectlyCreatePasswordAccount("admin")).toBe(false);

    const mismatch = adminSetPasswordSchema.safeParse({
      password: "long-enough-password",
      confirmPassword: "different-password",
    });
    expect(mismatch.success).toBe(false);

    const weak = adminSetPasswordSchema.safeParse({
      password: "short",
      confirmPassword: "short",
    });
    expect(weak.success).toBe(false);

    const valid = adminSetPasswordSchema.safeParse({
      password: "long-enough-password",
      confirmPassword: "long-enough-password",
      requirePasswordChange: true,
    });
    expect(valid.success).toBe(true);

    const metadata = adminSetPasswordAuditMetadata({ requirePasswordChange: true, sessionsRevoked: true });
    expect(metadata).toEqual({
      method: "admin_set",
      requirePasswordChange: true,
      sessionsRevoked: true,
    });
    expect(JSON.stringify(metadata)).not.toContain("long-enough-password");
    expect(metadata).not.toHaveProperty("password");
    expect(metadata).not.toHaveProperty("confirmPassword");
    expect(metadata).not.toHaveProperty("newPassword");
  });

  it("keeps the campaign queue simulation-only", () => {
    expect(queueEnvSchema.safeParse({
      QUEUE_ENABLED: "true",
      QUEUE_SIMULATION_ONLY: "false",
      REDIS_URL: "redis://127.0.0.1:6379",
    }).success).toBe(false);
  });
});
