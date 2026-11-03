/**
 * Lightweight connectivity check. Does not read or write application data.
 * Usage: npm run db:check
 */
import { checkDatabase } from "../db/index.js";
import { loadConfiguredEnvFiles } from "../env-files.js";
import { validateDatabaseUrl } from "../lib/database-url.js";

loadConfiguredEnvFiles();

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const validation = validateDatabaseUrl(databaseUrl);
if (validation.status !== "VALID") {
  console.log(
    JSON.stringify(
      {
        ok: false,
        target: validation.detail,
        elapsedMs: 0,
        kind: "configuration",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const result = await checkDatabase(databaseUrl);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
