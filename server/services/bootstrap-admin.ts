import { eq } from "drizzle-orm";

import { parseRoleKeys } from "../auth/permissions.js";
import type { Database } from "../db/index.js";
import * as schema from "../db/schema.js";
import { defaultTwoFactorEnforcementDate } from "../lib/account-security.js";
import { resolveBootstrapPassword } from "../lib/bootstrap-password.js";
import { withPgAdvisoryLock } from "../mail/lock.js";

export const BOOTSTRAP_SUPER_ADMIN_ROLE = "super-admin";
const LOCK_NAME = "kivorenta-bootstrap-admin";

export type BootstrapUserRow = {
  email: string;
  role: string | null;
  banned: boolean | null;
};

export type BootstrapPreflight =
  | { action: "proceed" }
  | { action: "skip"; reason: "email_exists"; email: string }
  | { action: "refuse"; reason: "already_initialized" };

export function bootstrapPreflight(
  users: BootstrapUserRow[],
  bootstrapEmail: string,
): BootstrapPreflight {
  const email = bootstrapEmail.trim().toLowerCase();
  if (users.some((row) => row.email.trim().toLowerCase() === email)) {
    return { action: "skip", reason: "email_exists", email };
  }
  const hasSuperAdmin = users.some(
    (row) => parseRoleKeys(row.role).includes(BOOTSTRAP_SUPER_ADMIN_ROLE) && !row.banned,
  );
  if (hasSuperAdmin) {
    return { action: "refuse", reason: "already_initialized" };
  }
  return { action: "proceed" };
}

export type BootstrapSuccess = {
  status: "success";
  email: string;
  name: string;
  role: string;
  temporaryPassword: string | null;
  loginUrl: string;
};

export type BootstrapSkipped = {
  status: "skipped";
  reason: "email_exists";
  email: string;
};

export type BootstrapRefused = {
  status: "refused";
  reason: "already_initialized";
};

export type BootstrapFailure = {
  status: "error";
  message: string;
};

export type BootstrapOutcome = BootstrapSuccess | BootstrapSkipped | BootstrapRefused | BootstrapFailure;

export type SignUpEmailFn = (body: {
  name: string;
  email: string;
  password: string;
}) => Promise<{ user?: { id: string } | null }>;

export type RunBootstrapInput = {
  db: Database;
  email: string;
  displayName: string;
  loginUrl: string;
  signUpEmail: SignUpEmailFn;
  env?: NodeJS.ProcessEnv;
};

async function listBootstrapUsers(db: Database): Promise<BootstrapUserRow[]> {
  return db
    .select({
      email: schema.user.email,
      role: schema.user.role,
      banned: schema.user.banned,
    })
    .from(schema.user);
}

export async function runBootstrapAdmin(input: RunBootstrapInput): Promise<BootstrapOutcome> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim() || "Administrator";
  if (!email) {
    return { status: "error", message: "BOOTSTRAP_ADMIN_EMAIL is required." };
  }

  const passwordResolution = resolveBootstrapPassword(input.env);
  if (passwordResolution.error) {
    return { status: "error", message: passwordResolution.error };
  }
  const password = passwordResolution.password;
  const generatedPassword = passwordResolution.generated;

  try {
    return await withPgAdvisoryLock(input.db, LOCK_NAME, async () => {
      const users = await listBootstrapUsers(input.db);
      const preflight = bootstrapPreflight(users, email);
      if (preflight.action === "skip") {
        return { status: "skipped", reason: "email_exists", email: preflight.email };
      }
      if (preflight.action === "refuse") {
        return { status: "refused", reason: "already_initialized" };
      }

      const signUp = await input.signUpEmail({
        name: displayName,
        email,
        password,
      });

      if (!signUp?.user?.id) {
        return { status: "error", message: "Better Auth did not return a created user." };
      }

      const userId = signUp.user.id;
      const now = new Date();

      await input.db
        .update(schema.user)
        .set({
          emailVerified: true,
          role: BOOTSTRAP_SUPER_ADMIN_ROLE,
          banned: false,
          banReason: null,
          banExpires: null,
          mustChangePassword: true,
          twoFactorEnforcementAfter: defaultTwoFactorEnforcementDate(now),
          updatedAt: now,
        })
        .where(eq(schema.user.id, userId));

      await input.db
        .insert(schema.appUserRoles)
        .values({
          userId,
          roleId: "role_super-admin",
          assignedBy: null,
        })
        .onConflictDoNothing();

      const [verified] = await input.db
        .select({
          id: schema.user.id,
          email: schema.user.email,
          emailVerified: schema.user.emailVerified,
          role: schema.user.role,
          name: schema.user.name,
        })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);

      const [credential] = await input.db
        .select({ password: schema.account.password })
        .from(schema.account)
        .where(eq(schema.account.userId, userId))
        .limit(1);

      const [flags] = await input.db
        .select({ mustChangePassword: schema.user.mustChangePassword })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);

      if (
        !verified?.emailVerified ||
        verified.role !== BOOTSTRAP_SUPER_ADMIN_ROLE ||
        !flags?.mustChangePassword
      ) {
        return {
          status: "error",
          message: "Administrator role or verification state was not applied correctly.",
        };
      }

      if (!credential?.password || credential.password.length < 20) {
        return { status: "error", message: "Credential account was not created with a password hash." };
      }

      return {
        status: "success",
        email: verified.email,
        name: verified.name,
        role: verified.role ?? BOOTSTRAP_SUPER_ADMIN_ROLE,
        temporaryPassword: generatedPassword ? password : null,
        loginUrl: input.loginUrl,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap failed.";
    return { status: "error", message };
  }
}

export function formatBootstrapBanner(outcome: BootstrapOutcome): string {
  const line = "========================================";
  if (outcome.status === "success") {
    const blocks = [
      line,
      "KIVORENTA ADMINISTRATOR BOOTSTRAP",
      line,
      "",
      "Status: SUCCESS",
      "",
      `Email: ${outcome.email}`,
      `Name: ${outcome.name}`,
      `Role: ${outcome.role}`,
      "",
    ];
    if (outcome.temporaryPassword) {
      blocks.push(
        "Temporary password:",
        outcome.temporaryPassword,
        "",
        "IMPORTANT:",
        "Save this password securely.",
        "It will not be displayed again.",
        "Keep terminal output private.",
        "",
        "Change this password at /app/change-password/ immediately after your first login.",
        "(Server-side enforcement is enabled until the password is changed.)",
        "",
      );
    } else {
      blocks.push(
        "Password: supplied via BOOTSTRAP_ADMIN_PASSWORD (not shown).",
        "",
        "Change this password after first login if it was shared or logged elsewhere.",
        "",
      );
    }
    blocks.push("Login:", outcome.loginUrl, "", line);
    return blocks.join("\n");
  }

  if (outcome.status === "skipped") {
    return [
      line,
      "KIVORENTA ADMINISTRATOR BOOTSTRAP",
      line,
      "",
      "Status: SKIPPED",
      "",
      `An account already exists for ${outcome.email}.`,
      "No changes were made.",
      "",
      line,
    ].join("\n");
  }

  if (outcome.status === "refused") {
    return [
      line,
      "KIVORENTA ADMINISTRATOR BOOTSTRAP",
      line,
      "",
      "Status: REFUSED",
      "",
      "Bootstrap initialization has already occurred (a super-administrator exists).",
      "Create additional administrators through the normal admin workflow.",
      "",
      line,
    ].join("\n");
  }

  return [
    line,
    "KIVORENTA ADMINISTRATOR BOOTSTRAP",
    line,
    "",
    "Status: FAILED",
    "",
    outcome.message,
    "",
    line,
  ].join("\n");
}
