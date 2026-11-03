/**
 * Writes .env and .env.production with fresh Better Auth secrets.
 * Preserves an existing independent DATABASE_URL in .env when present.
 * Never logs secret values.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function parseEnv(content) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function secret() {
  return randomBytes(48).toString("base64url");
}

const envPath = resolve(root, ".env");
const prodPath = resolve(root, ".env.production");
const backupPath = resolve(root, ".env.backup.local");

/** @type {Record<string, string>} */
let preserved = {};
if (existsSync(envPath)) {
  copyFileSync(envPath, backupPath);
  preserved = parseEnv(readFileSync(envPath, "utf8"));
}

const devAuthSecret = secret();
const prodAuthSecret = secret();

const databaseUrl =
  preserved.DATABASE_URL?.trim() &&
  !preserved.DATABASE_URL.includes("user:password") &&
  !preserved.DATABASE_URL.includes("REPLACE_")
    ? preserved.DATABASE_URL
    : "postgresql://REPLACE_WITH_BINARIES_NL_NEON_CONNECTION?sslmode=require";

  const devEnv = `# Binaries.nl — local development. Do not commit.

# --- Application ---
APP_NAME=Binaries.nl
APP_COMPANY_NAME=Binaries.nl
# Public browser origin (also set FRONTEND_URL and BETTER_AUTH_URL to match).
VITE_APP_URL=http://localhost:5173
VITE_CONTACT_EMAIL=

# --- Authentication (Better Auth) ---
BETTER_AUTH_URL=http://localhost:5173
FRONTEND_URL=http://localhost:5173
BETTER_AUTH_SECRET=${devAuthSecret}
AUTH_EMAIL_DELIVERY=console
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Set AUTH_EMAIL_DELIVERY=resend to deliver auth mail through Resend.

# --- Database (Neon PostgreSQL — Binaries.nl project only) ---
DATABASE_URL=${databaseUrl}

# --- Redis / queues (simulation only) ---
QUEUE_ENABLED=true
QUEUE_SIMULATION_ONLY=true
QUEUE_NAMESPACE=kivorenta
REDIS_URL=redis://127.0.0.1:6379

# --- Operational mailbox (Spacemail inbox access; not SendStack/CTN) ---
SPACEMAIL_IMAP_HOST=mail.spacemail.com
SPACEMAIL_IMAP_PORT=993
SPACEMAIL_IMAP_SECURE=true
SPACEMAIL_EMAIL=
SPACEMAIL_PASSWORD=
SPACEMAIL_SENDER_NAME=
SPACEMAIL_TEST_RECIPIENT=

# --- Server ---
PORT=3001

# --- Bootstrap (optional) ---
BOOTSTRAP_ADMIN_EMAIL=
BOOTSTRAP_ADMIN_NAME=Administrator
# BOOTSTRAP_ADMIN_PASSWORD=

# --- Destructive scripts ---
# SENDSTACK_DB_RESET_CONFIRM=yes
`;

const prodEnv = `# Binaries.nl — production template. Copy values to Vercel; do not commit.

# --- Application ---
APP_NAME=Binaries.nl
APP_COMPANY_NAME=Binaries.nl
VITE_APP_URL=https://YOUR_DOMAIN
VITE_CONTACT_EMAIL=

# --- Authentication (Better Auth) ---
BETTER_AUTH_URL=https://YOUR_DOMAIN
FRONTEND_URL=https://YOUR_DOMAIN
BETTER_AUTH_SECRET=${prodAuthSecret}
# Set to resend once RESEND_API_KEY and RESEND_FROM_EMAIL are configured.
AUTH_EMAIL_DELIVERY=resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# --- Database (Neon — production branch / database for Kivorenta) ---
DATABASE_URL=postgresql://REPLACE_WITH_BINARIES_NL_PRODUCTION_NEON?sslmode=require

# --- Redis / queues (Upstash TCP/TLS — not REST URL) ---
QUEUE_ENABLED=true
QUEUE_SIMULATION_ONLY=true
QUEUE_NAMESPACE=kivorenta
REDIS_URL=rediss://REPLACE_WITH_BINARIES_NL_UPSTASH_TCP_URL

# --- Operational mailbox ---
SPACEMAIL_IMAP_HOST=mail.spacemail.com
SPACEMAIL_IMAP_PORT=993
SPACEMAIL_IMAP_SECURE=true
SPACEMAIL_EMAIL=
SPACEMAIL_PASSWORD=
SPACEMAIL_SENDER_NAME=
SPACEMAIL_TEST_RECIPIENT=

# --- Vercel ---
# NODE_ENV=production
# VERCEL=1
`;

writeFileSync(envPath, devEnv, { mode: 0o600 });
writeFileSync(prodPath, prodEnv, { mode: 0o600 });

console.log("Wrote .env and .env.production (secrets not printed).");
if (existsSync(backupPath)) {
  console.log("Previous .env backed up to .env.backup.local");
}
