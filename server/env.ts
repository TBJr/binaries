import { z } from "zod";

import { logSafeEnvironment } from "./lib/env-summary.js";
import { loadConfiguredEnvFiles } from "./env-files.js";

loadConfiguredEnvFiles();

const emptyToUndefined = (value: unknown) =>
  value === "" || value === undefined || value === null ? undefined : value;

/** Core server env shared by API, workers, and dispatchers (no public auth URLs). */
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_NAME: z.string().min(1).max(80).default("Binaries.nl"),
  APP_COMPANY_NAME: z.string().min(1).max(80).default("Binaries.nl"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** Long-running server only. Vercel always uses a single connection. */
  DATABASE_POOL_MAX: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(20).optional(),
  ),
  /** Rounded up to whole seconds for postgres.js. Defaults: 10s long-running, 8s Vercel. */
  DATABASE_CONNECT_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1_000).max(30_000).optional(),
  ),
  /** Eligible recipients allowed in one Settings test-list send. Default 8. */
  TEST_MESSAGE_MAX_LIST_RECIPIENTS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(25).optional(),
  ),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  PORT: z.coerce.number().int().positive().default(3001),
  /** console = log links in dev; smtp/resend = deliver; disabled = no outbound mail */
  AUTH_EMAIL_DELIVERY: z.enum(["console", "smtp", "resend", "disabled"]).default("console"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
});

const envSchema = baseEnvSchema.extend({
  BETTER_AUTH_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
});

export type ServerEnv = z.infer<typeof envSchema>;
export type WorkerServerEnv = z.infer<typeof baseEnvSchema>;

/** Fields `createDb` reads from env. */
export type DbEnv = Pick<
  WorkerServerEnv,
  "NODE_ENV" | "DATABASE_URL" | "DATABASE_POOL_MAX" | "DATABASE_CONNECT_TIMEOUT_MS"
>;

function formatEnvIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "env";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function parseEnv<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  logSafeEnvironment();
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${formatEnvIssues(parsed.error)}`);
  }
  return parsed.data;
}

/** Full API/auth env — requires public `BETTER_AUTH_URL` and `FRONTEND_URL`. */
export function loadEnv(): ServerEnv {
  return parseEnv(envSchema);
}

/**
 * Background worker/dispatcher env — same core credentials as the API, but
 * public auth URLs are not required (those processes never use them).
 */
export function loadWorkerEnv(): WorkerServerEnv {
  return parseEnv(baseEnvSchema);
}
