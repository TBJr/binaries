/**
 * Optional: mark an existing account for mandatory password change (does not reset the password).
 *
 * Usage:
 *   BOOTSTRAP_ADMIN_EMAIL=admin@example.com npm run security:request-password-rotation
 */
import { eq } from "drizzle-orm";

import { createDb } from "../db/index.js";
import { user } from "../db/schema.js";
import { loadEnv } from "../env.js";

const env = loadEnv();
const email = process.env.SECURITY_ROTATION_EMAIL?.trim().toLowerCase();
if (!email) {
  console.error("Set SECURITY_ROTATION_EMAIL to the account that should rotate its password.");
  process.exit(1);
}

const { db, client } = createDb(env);
try {
  const [row] = await db.select({ id: user.id, email: user.email }).from(user).where(eq(user.email, email)).limit(1);
  if (!row) {
    console.error(`No user found for ${email}.`);
    process.exit(1);
  }
  await db.update(user).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(user.id, row.id));
  console.log(`Password rotation requested for ${row.email}. The user must change their password on next sign-in.`);
} finally {
  await client.end();
}
