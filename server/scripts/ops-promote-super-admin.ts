/**
 * Ops: promote an existing account to super-admin in the environment
 * pointed at by APP_ENV_FILE / --production / .env.
 *
 * Usage:
 *   APP_ENV_FILE=.env.production \
 *   OPS_PROMOTE_EMAIL=user@example.com \
 *   OPS_PROMOTE_APPLY=true \
 *   npx tsx server/scripts/ops-promote-super-admin.ts
 */
import { eq } from "drizzle-orm";

import { parseRoleKeys } from "../auth/permissions.js";
import { createDb } from "../db/index.js";
import { appUserAccess, appUserRoles, user } from "../db/schema.js";
import { loadEnv } from "../env.js";
import { defaultTwoFactorEnforcementDate } from "../lib/account-security.js";

const SUPER_ADMIN_ROLE = "super-admin";
const SUPER_ADMIN_ROLE_ID = "role_super-admin";

const email = process.env.OPS_PROMOTE_EMAIL?.trim().toLowerCase();
const apply = process.env.OPS_PROMOTE_APPLY === "true";

if (!email) {
  console.error("Set OPS_PROMOTE_EMAIL to the account email.");
  process.exit(1);
}

const env = loadEnv();
const { db, client } = createDb(env);

function redactUser(row: typeof user.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    role: row.role,
    banned: row.banned,
    banReason: row.banReason,
    mustChangePassword: row.mustChangePassword,
    twoFactorEnabled: row.twoFactorEnabled,
    twoFactorEnforcementAfter: row.twoFactorEnforcementAfter,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function loadAppRoleIds(userId: string) {
  const rows = await db
    .select({ roleId: appUserRoles.roleId })
    .from(appUserRoles)
    .where(eq(appUserRoles.userId, userId));
  return rows.map((row) => row.roleId).sort();
}

try {
  const [row] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (!row) {
    console.error(JSON.stringify({ found: false, email }, null, 2));
    process.exit(1);
  }

  const [access] = await db.select().from(appUserAccess).where(eq(appUserAccess.userId, row.id)).limit(1);
  const appRoleIds = await loadAppRoleIds(row.id);
  const alreadySuperAdmin =
    parseRoleKeys(row.role).includes(SUPER_ADMIN_ROLE) && appRoleIds.includes(SUPER_ADMIN_ROLE_ID);

  console.log(
    JSON.stringify(
      {
        found: true,
        apply,
        alreadySuperAdmin,
        user: redactUser(row),
        access: access ?? null,
        appRoleIds,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Diagnosis only. Re-run with OPS_PROMOTE_APPLY=true to promote.");
    process.exit(0);
  }

  if (alreadySuperAdmin) {
    console.log(JSON.stringify({ ok: true, status: "skipped", reason: "already_super_admin" }, null, 2));
    process.exit(0);
  }

  const now = new Date();
  const twoFactorEnforcementAfter = row.twoFactorEnforcementAfter ?? defaultTwoFactorEnforcementDate(now);
  const fixes: string[] = [];

  await db
    .update(user)
    .set({
      role: SUPER_ADMIN_ROLE,
      twoFactorEnforcementAfter,
      updatedAt: now,
    })
    .where(eq(user.id, row.id));
  fixes.push("role_set_super-admin");
  if (!row.twoFactorEnforcementAfter) {
    fixes.push("two_factor_enforcement_grace_set");
  } else {
    fixes.push("two_factor_enforcement_grace_kept");
  }

  await db.delete(appUserRoles).where(eq(appUserRoles.userId, row.id));
  await db.insert(appUserRoles).values({
    userId: row.id,
    roleId: SUPER_ADMIN_ROLE_ID,
    assignedBy: null,
  });
  fixes.push("app_user_roles_synced");

  const [after] = await db.select().from(user).where(eq(user.id, row.id)).limit(1);
  const afterRoles = after ? await loadAppRoleIds(after.id) : [];

  console.log(
    JSON.stringify(
      {
        ok: true,
        fixes,
        user: after ? redactUser(after) : null,
        appRoleIds: afterRoles,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
