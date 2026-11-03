import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { eq } from "drizzle-orm";

import { auth } from "../auth/auth.js";
import { createDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { loadEnv } from "../env.js";
import { demoUserSeedSchema } from "../lib/demo-user-seed.js";
import { generateTemporaryPassword } from "../lib/bootstrap-password.js";
import { fetchDatabaseInventory } from "../lib/db-identity.js";
import { safeErrorLabel } from "../lib/startup-log.js";
import { seedAccessControl } from "../services/access-control.js";
import { runBootstrapAdmin } from "../services/bootstrap-admin.js";
import { withPgAdvisoryLock } from "../mail/lock.js";

const env = loadEnv();
const seedFile = process.env.SEED_DEMO_USERS_FILE?.trim();
const credentialsFile = resolve(
  process.env.SEED_DEMO_USERS_CREDENTIALS_FILE?.trim() ||
    "server/seeds/demo-users.credentials.local.json",
);
if (process.env.SEED_DEMO_USERS !== "true") {
  console.error("Set SEED_DEMO_USERS=true to explicitly enable demo-user seeding.");
  process.exit(1);
}
if (!seedFile) {
  console.error("Set SEED_DEMO_USERS_FILE to a JSON seed file.");
  process.exit(1);
}
if (env.NODE_ENV === "production" && process.env.SEED_DEMO_USERS_CONFIRM_PRODUCTION !== "yes") {
  console.error("Production seeding requires SEED_DEMO_USERS_CONFIRM_PRODUCTION=yes.");
  process.exit(1);
}

let seedInput: unknown;
try {
  seedInput = JSON.parse(readFileSync(resolve(seedFile), "utf8"));
} catch (error) {
  console.error("Could not read the demo-user seed file:", safeErrorLabel(error));
  process.exit(1);
}

const parsedSeed = demoUserSeedSchema.safeParse(seedInput);
if (!parsedSeed.success) {
  console.error(
    "Invalid demo-user seed file:",
    parsedSeed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
  );
  process.exit(1);
}

const credentials: Array<{
  email: string;
  name: string;
  role: string;
  temporaryPassword: string;
  status: "pending" | "created";
}> = [];
let credentialsFd: number;
try {
  credentialsFd = openSync(credentialsFile, "wx", 0o600);
  writeFileSync(credentialsFd, JSON.stringify({ users: credentials }, null, 2) + "\n");
  closeSync(credentialsFd);
} catch (error) {
  console.error(
    `Could not create credentials output file (it must be new): ${safeErrorLabel(error)}`,
  );
  process.exit(1);
}

function saveCredentials() {
  writeFileSync(credentialsFile, JSON.stringify({ users: credentials }, null, 2) + "\n", {
    mode: 0o600,
  });
}

const { db, client } = createDb(env);
let exitCode = 0;
try {
  const inventory = await fetchDatabaseInventory(client);
  const tables = new Set(inventory.tables.map((name) => name.replace(/^public\./, "")));
  const required = ["user", "account", "app_roles", "app_permissions", "app_role_permissions", "app_user_roles"];
  const missing = required.filter((table) => !tables.has(table));
  if (missing.length > 0) {
    throw new Error(`Missing required tables: ${missing.join(", ")}. Run npm run db:migrate first.`);
  }

  await seedAccessControl(db);
  await withPgAdvisoryLock(db, "kivorenta-seed-demo-users", async () => {
    for (const account of parsedSeed.data.users) {
      const [existing] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.email, account.email))
        .limit(1);
      if (existing) {
        console.log(`Skipped existing account (${account.role}): ${account.email}`);
        continue;
      }

      if (account.role === "super-admin") {
        const password = generateTemporaryPassword();
        credentials.push({ ...account, temporaryPassword: password, status: "pending" });
        saveCredentials();
        const outcome = await runBootstrapAdmin({
          db,
          email: account.email,
          displayName: account.name,
          loginUrl: env.FRONTEND_URL.replace(/\/+$/, ""),
          env: { BOOTSTRAP_ADMIN_PASSWORD: password },
          signUpEmail: (body) => auth.api.signUpEmail({ body }),
        });
        if (outcome.status === "success") {
          credentials[credentials.length - 1]!.status = "created";
          saveCredentials();
          console.log(`Created ${outcome.role}: ${outcome.email}`);
          continue;
        }
        if (outcome.status === "skipped") {
          credentials.pop();
          saveCredentials();
          console.log(`Skipped existing account (super-admin): ${outcome.email}`);
          continue;
        }
        credentials.pop();
        saveCredentials();
        throw new Error(
          outcome.status === "refused"
            ? "Refusing to seed a super-admin while another active super-admin exists."
            : outcome.message,
        );
      }

      const password = generateTemporaryPassword();
      credentials.push({ ...account, temporaryPassword: password, status: "pending" });
      saveCredentials();
      let result: Awaited<ReturnType<typeof auth.api.signUpEmail>>;
      try {
        result = await auth.api.signUpEmail({
          body: { name: account.name, email: account.email, password },
        });
      } catch (error) {
        credentials.pop();
        saveCredentials();
        throw error;
      }
      const userId = result.user?.id;
      if (!userId) {
        credentials.pop();
        saveCredentials();
        throw new Error(`Better Auth did not create an account for ${account.email}.`);
      }

      const now = new Date();
      await db.transaction(async (transaction) => {
        await transaction
          .update(schema.user)
          .set({
            emailVerified: true,
            role: account.role,
            banned: false,
            banReason: null,
            banExpires: null,
            mustChangePassword: true,
            updatedAt: now,
          })
          .where(eq(schema.user.id, userId));

        await transaction
          .insert(schema.appUserRoles)
          .values({ userId, roleId: `role_${account.role}`, assignedBy: null })
          .onConflictDoNothing();
      });

      const [created] = await db
        .select({
          role: schema.user.role,
          emailVerified: schema.user.emailVerified,
          mustChangePassword: schema.user.mustChangePassword,
        })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);
      if (!created?.emailVerified || !created.mustChangePassword || created.role !== account.role) {
        throw new Error(`Could not verify the seeded account state for ${account.email}.`);
      }

      credentials[credentials.length - 1]!.status = "created";
      saveCredentials();
      console.log(`Created ${account.role}: ${account.email}`);
    }
  });
} catch (error) {
  console.error("Demo-user seeding failed:", safeErrorLabel(error));
  exitCode = 1;
} finally {
  await client.end();
}

console.log(`Temporary passwords saved to ${credentialsFile}`);
process.exit(exitCode);
