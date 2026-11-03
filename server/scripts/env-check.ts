/**
 * Safe environment validation — never prints secret values.
 * Usage: npm run env:check [-- --production] [-- --file path]
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

import { z } from "zod";

import { validateDatabaseUrl } from "../lib/database-url.js";
import { mailboxCredentialsConfigured, parseTestRecipientsFromEnv } from "../mail/configuration.js";
import { queueEnvSchema } from "../queue/configuration.js";
import { assertRedisProtocolUrl, summarizeRedisUrl } from "../queue/redis-url.js";

type Status = "VALID" | "MISSING" | "INVALID";

type Finding = { key: string; status: Status; detail: string };

const LEGACY_HOST_PATTERNS = [/ctn-sk\.com/i, /info@ctn-sk\.com/i];

const serverCoreSchema = z.object({
  APP_NAME: z.string().min(1).optional(),
  APP_COMPANY_NAME: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  AUTH_EMAIL_DELIVERY: z.enum(["console", "smtp", "disabled"]).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  PORT: z.coerce.number().int().positive().optional(),
});

const frontendPublicSchema = z.object({
  VITE_APP_URL: z.string().url().optional(),
  VITE_CONTACT_EMAIL: z.string().email().optional().or(z.literal("")),
});

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return { ok: false as const, error: `File not found: ${filePath}` };
  }
  const parsed = parse(readFileSync(filePath));
  /** Treat blank strings as unset for optional fields. */
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string" && value.trim() === "") continue;
    values[key] = value;
  }
  return { ok: true as const, values };
}

function scanLegacy(values: Record<string, string>): Finding[] {
  const findings: Finding[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (!value?.trim()) continue;
    for (const pattern of LEGACY_HOST_PATTERNS) {
      if (pattern.test(value)) {
        findings.push({
          key,
          status: "INVALID",
          detail: "Value references original CTN/SendStack production infrastructure",
        });
        break;
      }
    }
  }
  return findings;
}

function checkAuthEmail(values: Record<string, string>, production: boolean): Finding[] {
  const findings: Finding[] = [];
  const mode = values.AUTH_EMAIL_DELIVERY ?? "console";
  if (production && mode === "console") {
    findings.push({
      key: "AUTH_EMAIL_DELIVERY",
      status: "INVALID",
      detail: "Production must use AUTH_EMAIL_DELIVERY=smtp (console does not deliver mail)",
    });
  }
  if (production && mode === "disabled") {
    findings.push({
      key: "AUTH_EMAIL_DELIVERY",
      status: "INVALID",
      detail: "Production requires transactional SMTP for authentication email",
    });
  }
  if (mode === "smtp") {
    for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const) {
      if (!values[key]?.trim()) {
        findings.push({ key, status: "MISSING", detail: "Required when AUTH_EMAIL_DELIVERY=smtp" });
      }
    }
  }
  return findings;
}

function checkUrlAlignment(values: Record<string, string>, production: boolean): Finding[] {
  const findings: Finding[] = [];
  const front = values.FRONTEND_URL?.trim();
  const auth = values.BETTER_AUTH_URL?.trim();
  const vite = values.VITE_APP_URL?.trim();
  if (front && auth && front !== auth) {
    findings.push({
      key: "BETTER_AUTH_URL",
      status: "INVALID",
      detail: "Should match FRONTEND_URL origin for cookie/session consistency",
    });
  }
  if (vite && front && vite !== front) {
    findings.push({
      key: "VITE_APP_URL",
      status: "INVALID",
      detail: "Should match FRONTEND_URL for auth client and canonical links",
    });
  }
  if (production && front?.includes("localhost")) {
    findings.push({
      key: "FRONTEND_URL",
      status: "INVALID",
      detail: "Production config should not use localhost",
    });
  }
  return findings;
}

function checkRedis(values: Record<string, string>, production: boolean): Finding[] {
  const findings: Finding[] = [];
  const queue = queueEnvSchema.safeParse(values);
  if (!queue.success) {
    for (const issue of queue.error.issues) {
      const key = String(issue.path[0] ?? "QUEUE");
      findings.push({ key, status: "INVALID", detail: issue.message });
    }
    return findings;
  }
  const q = queue.data;
  if (q.QUEUE_SIMULATION_ONLY !== true) {
    findings.push({
      key: "QUEUE_SIMULATION_ONLY",
      status: "INVALID",
      detail: "Must remain true (simulation-only campaigns)",
    });
  }
  if (q.QUEUE_ENABLED && q.REDIS_URL?.trim()) {
    try {
      assertRedisProtocolUrl(q.REDIS_URL.trim());
      const summary = summarizeRedisUrl(q.REDIS_URL.trim());
      if (production && !summary.tls) {
        findings.push({
          key: "REDIS_URL",
          status: "INVALID",
          detail: "Production Redis should use rediss:// (TLS)",
        });
      }
    } catch (error) {
      findings.push({
        key: "REDIS_URL",
        status: "INVALID",
        detail: error instanceof Error ? error.message : "Invalid Redis URL",
      });
    }
  }
  return findings;
}

function checkMailbox(values: Record<string, string>): Finding[] {
  const findings: Finding[] = [];
  if (!mailboxCredentialsConfigured(values)) {
    return findings;
  }

  const hostKeys = [
    "SPACEMAIL_SMTP_HOST",
    "SPACEMAIL_SMTP_PORT",
    "SPACEMAIL_SMTP_SECURE",
    "SPACEMAIL_IMAP_HOST",
    "SPACEMAIL_IMAP_PORT",
    "SPACEMAIL_IMAP_SECURE",
  ] as const;
  for (const key of hostKeys) {
    if (!values[key]?.trim()) {
      findings.push({ key, status: "MISSING", detail: "Required when mailbox credentials are configured" });
    }
  }

  const parsed = parseTestRecipientsFromEnv(values);
  if (!parsed.ok) {
    findings.push({
      key: "SPACEMAIL_TEST_RECIPIENTS",
      status: parsed.reason === "empty" ? "MISSING" : "INVALID",
      detail:
        parsed.reason === "empty"
          ? "Set SPACEMAIL_TEST_RECIPIENTS (comma-separated) or legacy SPACEMAIL_TEST_RECIPIENT when mailbox credentials are configured"
          : "SPACEMAIL_TEST_RECIPIENTS contains a malformed email address",
    });
    return findings;
  }

  findings.push({
    key: "SPACEMAIL_TEST_RECIPIENTS",
    status: "VALID",
    detail: `${parsed.recipients.length} authorized test recipient(s) configured`,
  });
  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const production = args.includes("--production");
  const fileArg = args.find((a) => a.startsWith("--file="))?.slice("--file=".length);
  const filePath = resolve(process.cwd(), fileArg ?? (production ? ".env.production" : ".env"));

  const loaded = loadEnvFile(filePath);
  if (!loaded.ok) {
    console.log(JSON.stringify({ file: filePath, ok: false, error: loaded.error }, null, 2));
    process.exit(1);
  }

  const values = loaded.values;
  const findings: Finding[] = [...scanLegacy(values)];
  const database = validateDatabaseUrl(values.DATABASE_URL);
  findings.push({ key: "DATABASE_URL", status: database.status, detail: database.detail });

  const core = serverCoreSchema.safeParse(values);
  if (!core.success) {
    for (const issue of core.error.issues) {
      const key = String(issue.path[0] ?? "ENV");
      if (key === "DATABASE_URL") continue;
      findings.push({ key, status: issue.message.includes("required") ? "MISSING" : "INVALID", detail: issue.message });
    }
  } else {
    for (const key of ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "FRONTEND_URL"] as const) {
      if (values[key]?.trim()) {
        findings.push({ key, status: "VALID", detail: "Present" });
      }
    }
  }

  const front = frontendPublicSchema.safeParse(values);
  if (!front.success) {
    for (const issue of front.error.issues) {
      findings.push({
        key: String(issue.path[0] ?? "VITE"),
        status: "INVALID",
        detail: issue.message,
      });
    }
  }

  findings.push(...checkAuthEmail(values, production));
  findings.push(...checkUrlAlignment(values, production));
  findings.push(...checkRedis(values, production));
  findings.push(...checkMailbox(values));

  const bad = findings.filter((f) => f.status !== "VALID");
  const ok = bad.length === 0;

  console.log(
    JSON.stringify(
      {
        file: filePath,
        mode: production ? "production" : "development",
        ok,
        database: { status: database.status, detail: database.detail },
        summary: {
          valid: findings.filter((f) => f.status === "VALID").length,
          missing: findings.filter((f) => f.status === "MISSING").length,
          invalid: findings.filter((f) => f.status === "INVALID").length,
        },
        findings: bad,
      },
      null,
      2,
    ),
  );

  process.exit(ok ? 0 : 1);
}

main();
