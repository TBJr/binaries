import { auth } from "../auth/auth.js";
import { createDb } from "../db/index.js";
import { loadEnv } from "../env.js";
import { fetchDatabaseInventory } from "../lib/db-identity.js";
import { formatBootstrapBanner, runBootstrapAdmin } from "../services/bootstrap-admin.js";

const env = loadEnv();
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const displayName = (process.env.BOOTSTRAP_ADMIN_NAME ?? "Administrator").trim();
const loginUrl = env.FRONTEND_URL.replace(/\/+$/, "");

if (!email) {
  console.error(formatBootstrapBanner({ status: "error", message: "Set BOOTSTRAP_ADMIN_EMAIL." }));
  process.exit(1);
}

const { db, client } = createDb(env);

try {
  const inventory = await fetchDatabaseInventory(client);
  const required = ["user", "account", "session", "verification"];
  const present = new Set(inventory.tables.map((name) => name.replace(/^public\./, "")));
  const missing = required.filter((table) => !present.has(table));
  if (missing.length > 0) {
    console.error(
      formatBootstrapBanner({
        status: "error",
        message: `Missing Better Auth tables: ${missing.join(", ")}. Run npm run db:migrate first.`,
      }),
    );
    process.exit(1);
  }

  const outcome = await runBootstrapAdmin({
    db,
    email,
    displayName,
    loginUrl,
    env: process.env,
    signUpEmail: async (body) =>
      auth.api.signUpEmail({
        body,
      }),
  });

  console.log(formatBootstrapBanner(outcome));

  if (outcome.status === "error") {
    process.exit(1);
  }
  if (outcome.status === "refused") {
    process.exit(1);
  }
  process.exit(0);
} finally {
  await client.end();
}
