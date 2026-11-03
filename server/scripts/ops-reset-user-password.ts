/**
 * One-off ops: diagnose a user and set their credential password in the
 * environment pointed at by APP_ENV_FILE / --production / .env.
 *
 * Usage:
 *   APP_ENV_FILE=.env.production \
 *   OPS_RESET_EMAIL=user@example.com \
 *   OPS_RESET_PASSWORD='...' \
 *   npx tsx server/scripts/ops-reset-user-password.ts
 *
 * Optional: OPS_REQUIRE_PASSWORD_CHANGE=true
 */
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { createDb } from "../db/index.js";
import { account, appUserAccess, session, user } from "../db/schema.js";
import { loadEnv } from "../env.js";
import { validatePassword } from "../lib/password-policy.js";

const email = process.env.OPS_RESET_EMAIL?.trim().toLowerCase();
const password = process.env.OPS_RESET_PASSWORD ?? "";
const requirePasswordChange = process.env.OPS_REQUIRE_PASSWORD_CHANGE === "true";
const apply = process.env.OPS_RESET_APPLY === "true";

if (!email) {
  console.error("Set OPS_RESET_EMAIL to the account email.");
  process.exit(1);
}

const passwordError = validatePassword(password);
if (apply && passwordError) {
  console.error(passwordError);
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

try {
  const [row] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (!row) {
    console.error(JSON.stringify({ found: false, email }, null, 2));
    process.exit(1);
  }

  const accounts = await db.select().from(account).where(eq(account.userId, row.id));
  const [access] = await db.select().from(appUserAccess).where(eq(appUserAccess.userId, row.id)).limit(1);

  console.log(
    JSON.stringify(
      {
        found: true,
        user: redactUser(row),
        access: access ?? null,
        accounts: accounts.map((a) => ({
          id: a.id,
          providerId: a.providerId,
          accountId: a.accountId,
          hasPassword: Boolean(a.password),
          passwordHashLength: a.password?.length ?? 0,
        })),
        apply,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Diagnosis only. Re-run with OPS_RESET_APPLY=true to update password and fix blockers.");
    process.exit(0);
  }

  const now = new Date();
  const fixes: string[] = [];

  if (!row.emailVerified) {
    await db.update(user).set({ emailVerified: true, updatedAt: now }).where(eq(user.id, row.id));
    fixes.push("email_verified");
  }

  if (row.banned || access?.status === "suspended" || access?.status === "deactivated") {
    await db
      .insert(appUserAccess)
      .values({ userId: row.id, status: "active", updatedAt: now })
      .onConflictDoUpdate({
        target: appUserAccess.userId,
        set: { status: "active", updatedAt: now },
      });
    await db
      .update(user)
      .set({ banned: false, banReason: null, banExpires: null, updatedAt: now })
      .where(eq(user.id, row.id));
    fixes.push("reactivated");
  }

  const hashed = await hashPassword(password);
  const credential = accounts.find((a) => a.providerId === "credential");
  if (credential) {
    await db
      .update(account)
      .set({ password: hashed, updatedAt: now })
      .where(eq(account.id, credential.id));
    fixes.push("password_updated");
  } else {
    const id = crypto.randomUUID();
    await db.insert(account).values({
      id,
      accountId: row.id,
      providerId: "credential",
      userId: row.id,
      password: hashed,
      createdAt: now,
      updatedAt: now,
    });
    fixes.push("credential_created");
  }

  await db
    .update(user)
    .set({ mustChangePassword: requirePasswordChange, updatedAt: now })
    .where(eq(user.id, row.id));
  fixes.push(requirePasswordChange ? "must_change_password_true" : "must_change_password_false");

  const deleted = await db.delete(session).where(eq(session.userId, row.id)).returning({ id: session.id });
  fixes.push(`sessions_revoked:${deleted.length}`);

  const [after] = await db
    .select({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      banned: user.banned,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(eq(user.id, row.id))
    .limit(1);

  console.log(JSON.stringify({ ok: true, fixes, user: after }, null, 2));
} finally {
  await client.end();
}
