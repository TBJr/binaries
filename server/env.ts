import { z } from "zod";

import { logSafeEnvironment } from "./lib/env-summary.js";
import { loadConfiguredEnvFiles } from "./env-files.js";

loadConfiguredEnvFiles();

const emptyToUndefined = (value: unknown) =>
  value === "" || value === undefined || value === null ? undefined : value;

const envSchema = z.object({
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
  BETTER_AUTH_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
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

export type ServerEnv = z.infer<typeof envSchema>;

export function loadEnv(): ServerEnv {
  logSafeEnvironment();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid server environment: ${message}`);
  }
  return parsed.data;
}
