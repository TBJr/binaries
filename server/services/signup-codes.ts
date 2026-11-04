import { randomUUID } from "node:crypto";

import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { parseRoleKeys, type SignupRoleKey } from "../auth/permissions.js";
import type { Database } from "../db/index.js";
import { signupCodes } from "../db/schema.js";
import { loadEnv } from "../env.js";
import { AUDIT_ACTIONS } from "../lib/audit-taxonomy.js";
import { generateSignupCode, hashSignupCode, SIGNUP_CODE_TTL_MS, signupCodeStatus } from "../lib/signup-codes.js";
import { safeErrorLabel } from "../lib/startup-log.js";
import { recordAudit } from "./audit-log.js";

function requireSuperAdmin(role: string | null | undefined) {
  return parseRoleKeys(role).includes("super-admin");
}

export async function createSignupCode(
  db: Database,
  actor: { id: string; role?: string | null },
  roleKey: SignupRoleKey,
) {
  if (!requireSuperAdmin(actor.role)) {
    return { error: "Only a super admin can generate signup codes.", status: 403 as const };
  }

  const code = generateSignupCode();
  const expiresAt = new Date(Date.now() + SIGNUP_CODE_TTL_MS);
  const [created] = await db
    .insert(signupCodes)
    .values({
      id: randomUUID(),
      codeHash: hashSignupCode(code),
      roleKey,
      createdBy: actor.id,
      expiresAt,
    })
    .returning({ id: signupCodes.id });
  if (!created) throw new Error("Could not save the signup code.");

  try {
    await recordAudit(db, {
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.signupCodeCreated,
      metadata: { roleKey, expiresAt: expiresAt.toISOString() },
    });
  } catch (error) {
    console.error("[signup] code creation audit failed", safeErrorLabel(error));
  }

  const env = loadEnv();
  const url = new URL("/register/", env.FRONTEND_URL);
  url.searchParams.set("role", roleKey);
  url.hash = new URLSearchParams({ code }).toString();
  return {
    signupCode: {
      id: created.id,
      roleKey,
      code,
      signupUrl: url.toString(),
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function listSignupCodes(db: Database, actor: { role?: string | null }) {
  if (!requireSuperAdmin(actor.role)) return { error: "Only a super admin can view signup codes.", status: 403 as const };
  const rows = await db.select().from(signupCodes).orderBy(desc(signupCodes.createdAt)).limit(100);
  return {
    signupCodes: rows.map((row) => ({
      id: row.id,
      roleKey: row.roleKey,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      status: signupCodeStatus(row),
    })),
  };
}

export async function revokeSignupCode(
  db: Database,
  actor: { id: string; role?: string | null },
  id: string,
) {
  if (!requireSuperAdmin(actor.role)) {
    return { error: "Only a super admin can revoke signup codes.", status: 403 as const };
  }
  const now = new Date();
  const [revoked] = await db
    .update(signupCodes)
    .set({ revokedAt: now })
    .where(and(eq(signupCodes.id, id), isNull(signupCodes.usedAt), isNull(signupCodes.revokedAt)))
    .returning({ id: signupCodes.id, roleKey: signupCodes.roleKey });
  if (!revoked) return { error: "Active signup code not found.", status: 404 as const };
  try {
    await recordAudit(db, {
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.signupCodeRevoked,
      metadata: { roleKey: revoked.roleKey },
    });
  } catch (error) {
    console.error("[signup] code revocation audit failed", safeErrorLabel(error));
  }
  return { ok: true as const };
}

export async function claimSignupCode(db: Database, code: string, roleKey: SignupRoleKey) {
  const now = new Date();
  const [row] = await db
    .update(signupCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(signupCodes.codeHash, hashSignupCode(code)),
        eq(signupCodes.roleKey, roleKey),
        isNull(signupCodes.usedAt),
        isNull(signupCodes.revokedAt),
        gt(signupCodes.expiresAt, now),
      ),
    )
    .returning({ id: signupCodes.id, createdBy: signupCodes.createdBy });
  return row ? { ...row, usedAt: now } : null;
}

export async function releaseSignupCodeClaim(db: Database, id: string, usedAt: Date) {
  await db
    .update(signupCodes)
    .set({ usedAt: null })
    .where(and(eq(signupCodes.id, id), eq(signupCodes.usedAt, usedAt), isNull(signupCodes.revokedAt)));
}
