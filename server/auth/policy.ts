import { parseRoleKeys, PERMISSIONS, RESERVED_ROLE_KEYS, type PermissionKey } from "./permissions.js";

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function superAdminRemovalAllowed(input: {
  activeSuperAdmins: number;
  targetIsActiveSuperAdmin: boolean;
  nextIncludesSuperAdmin: boolean;
}) {
  if (input.targetIsActiveSuperAdmin && !input.nextIncludesSuperAdmin && input.activeSuperAdmins <= 1) {
    return false;
  }
  return true;
}

export function roleGrantError(input: {
  actorIsSuperAdmin: boolean;
  actorPermissions: ReadonlySet<string>;
  nextRoleKeys: string[];
  rolePermissions: Record<string, readonly string[]>;
  actorId: string;
  targetId: string;
  activeSuperAdmins: number;
  targetIsActiveSuperAdmin: boolean;
}) {
  if (input.actorId === input.targetId && input.targetIsActiveSuperAdmin && !input.nextRoleKeys.includes("super-admin")) {
    if (input.activeSuperAdmins <= 1) {
      return "You cannot remove your own super-admin access while you are the last active super admin.";
    }
  }

  if (
    !superAdminRemovalAllowed({
      activeSuperAdmins: input.activeSuperAdmins,
      targetIsActiveSuperAdmin: input.targetIsActiveSuperAdmin,
      nextIncludesSuperAdmin: input.nextRoleKeys.includes("super-admin"),
    })
  ) {
    return "The last active super admin cannot be removed.";
  }

  if (!input.actorIsSuperAdmin && input.nextRoleKeys.some((key) => key === "super-admin" || key === "admin")) {
    return "Only a super admin can assign an administrative role.";
  }

  if (!input.actorIsSuperAdmin) {
    for (const key of input.nextRoleKeys) {
      const permissions = input.rolePermissions[key] ?? [];
      if (permissions.some((permission) => !input.actorPermissions.has(permission))) {
        return "You cannot assign a role with permissions you do not have.";
      }
    }
  }

  return null;
}

export function customRoleKeyError(key: string) {
  const normalized = key.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return "Role keys use lowercase letters, numbers, and hyphens.";
  }
  if (RESERVED_ROLE_KEYS.has(normalized) || normalized.includes("super-admin")) {
    return "That role key is reserved.";
  }
  return null;
}

export function canDirectlyCreatePasswordAccount(role: string | null | undefined) {
  return parseRoleKeys(role).includes("super-admin");
}

export function userCreatedAuditMetadata(input: { roles: string[]; status: string; verificationEmail: string }) {
  return {
    roles: input.roles,
    status: input.status,
    verificationEmail: input.verificationEmail,
  };
}

export function invalidPermissionKeys(keys: string[]) {
  return keys.filter((key) => !PERMISSION_SET.has(key));
}

export type UserDeleteDecision =
  | { ok: true }
  | { ok: false; error: string; status: 403 | 404 };

/**
 * Pure guards for permanent account removal.
 * Does not touch the database.
 */
export function userDeleteDecision(input: {
  actorId: string;
  targetId: string | null | undefined;
  targetExists: boolean;
  activeSuperAdmins: number;
  targetIsActiveSuperAdmin: boolean;
}): UserDeleteDecision {
  if (!input.targetExists || !input.targetId) {
    return { ok: false, error: "User not found", status: 404 };
  }
  if (input.actorId === input.targetId) {
    return { ok: false, error: "You cannot delete your own account.", status: 403 };
  }
  if (
    !superAdminRemovalAllowed({
      activeSuperAdmins: input.activeSuperAdmins,
      targetIsActiveSuperAdmin: input.targetIsActiveSuperAdmin,
      nextIncludesSuperAdmin: false,
    })
  ) {
    return { ok: false, error: "The last active super admin cannot be deleted.", status: 403 };
  }
  return { ok: true };
}

export type { PermissionKey };
