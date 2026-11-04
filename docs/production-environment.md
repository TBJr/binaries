# Production environment (Binaries.nl v0.1.0)

Phase **7.5** deployment reference for Vercel (SPA + Hono API) and Railway (BullMQ worker + campaign dispatcher). Campaign delivery remains **simulation-only** (`QUEUE_SIMULATION_ONLY=true`).

## Where to configure variables

| Target | Location |
| --- | --- |
| **Vercel (Production / Preview)** | Project → Settings → Environment Variables |
| **Railway worker** | Service using `deploy/railway.worker.toml` → Variables |
| **Railway dispatcher** | Service using `deploy/railway.dispatcher.toml` → Variables |
| **Railway API (optional)** | Service using `deploy/railway.api.toml` — not required if API runs only on Vercel |
| **Local production check** | Copy `.env.production.example` → `.env.production`, fill values, run `npm run env:check:production` |

Vite variables (`VITE_*`) must be set in Vercel for **Production** (and Preview if previews should use the preview URL) because they are baked in at **build** time.

Never prefix secrets with `VITE_`.

## Variable reference

| Variable Name | Purpose | Required/Optional | Service | Secret | Production configuration notes |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | Runtime mode | Optional (Vercel sets `production` on deploy) | Vercel API | No | Use `production` on Railway long-running processes. |
| `APP_NAME` | Product name in auth/UI | Optional | Vercel API, Railway | No | Default `Binaries.nl` if unset. |
| `APP_COMPANY_NAME` | Branding / default sender name | Optional | Vercel API, Railway | No | Used when `SPACEMAIL_SENDER_NAME` is empty. |
| `VITE_APP_URL` | Public site origin for canonical URLs | **Required** (build) | Vercel (build + runtime reference) | No | Must match `FRONTEND_URL` / `BETTER_AUTH_URL`. HTTPS only. Browser auth requests use the current page origin. |
| `VITE_CONTACT_EMAIL` | Public contact on marketing pages | Optional | Vercel (build) | No | Safe to expose in frontend bundle. |
| `FRONTEND_URL` | CORS + Better Auth trusted origins base | **Required** | Vercel API, Railway | No | Same origin as `VITE_APP_URL`. Apex/www pairs added automatically for public hostnames. |
| `BETTER_AUTH_URL` | Better Auth `baseURL` | **Required** | Vercel API, Railway | No | Must match `FRONTEND_URL` origin. Cookies use `secure` when URL is `https://`. |
| `BETTER_AUTH_SECRET` | Session/signing secret | **Required** | Vercel API, Railway | **Yes** | ≥ 32 characters; unique per environment; rotate invalidates sessions. |
| `AUTH_EMAIL_DELIVERY` | Auth email transport | **Required** | Vercel API, Railway | No | Production must be `smtp` or `resend` (`env:check:production` rejects `console`). |
| `SMTP_HOST` | Auth transactional SMTP host | Required if `AUTH_EMAIL_DELIVERY=smtp` | Vercel API, Railway | No | Separate from `SPACEMAIL_*` (operational mailbox). |
| `SMTP_PORT` | Auth SMTP port | Required if smtp | Vercel API, Railway | No | `465` (TLS) or `587` (STARTTLS) per `server/lib/email.ts`. |
| `SMTP_USER` | Auth SMTP username | Required if smtp | Vercel API, Railway | **Yes** | |
| `SMTP_PASS` | Auth SMTP password | Required if smtp | Vercel API, Railway | **Yes** | |
| `SMTP_FROM` | Auth email From address | Required if smtp | Vercel API, Railway | No | Valid address when using a non-Resend SMTP server. |
| `RESEND_API_KEY` | Resend API credential | Required if `AUTH_EMAIL_DELIVERY=resend` or mailbox sending is used | Vercel API, Railway | **Yes** | Resend delivery uses its HTTPS API; keep server-side only and never use a `VITE_` variable. |
| `RESEND_FROM_EMAIL` | Verified outbound sender address | Required if Resend is used | Vercel API, Railway | No | Use an address on a domain verified in Resend, preferably a dedicated sending subdomain with SPF/DKIM configured. |
| `DATABASE_URL` | PostgreSQL for Drizzle/Better Auth | **Required** | Shared (Vercel + Railway) | **Yes** | Neon pooled URL with `sslmode=require` for the running app. See `docs/DATABASE-CONNECTIVITY.md`. |
| `DATABASE_POOL_MAX` | postgres.js pool size | Optional | Railway / local long-running | No | Default `10`. Ignored on Vercel, which keeps a single connection. Cap `20`. |
| `DATABASE_CONNECT_TIMEOUT_MS` | TCP connect timeout | Optional | Shared | No | Rounded up to seconds. Default `10000` long-running, `8000` on Vercel. |
| `REDIS_URL` | BullMQ/ioredis connection | Required if `QUEUE_ENABLED=true` | Shared | **Yes** | `redis://` or `rediss://` only — not Upstash REST HTTPS URL. Production should use `rediss://`. |
| `QUEUE_ENABLED` | Enable queue features | Optional (default `false`) | Vercel API + Railway | No | Set `true` when Redis is configured. Railway worker/dispatcher exit if `false`. |
| `QUEUE_SIMULATION_ONLY` | Phase 7 safety guard | **Required** | Vercel API + Railway | No | **Must be `true`.** Schema rejects `false`. |
| `QUEUE_NAMESPACE` | BullMQ queue name prefix | Optional | Shared | No | Default `kivorenta` → `{namespace}-campaign-dispatch` and `{namespace}-email-processing`. |
| `QUEUE_WORKER_CONCURRENCY` | Worker parallelism | Optional | Railway worker | No | Default `2`. |
| `QUEUE_MAX_JOBS_PER_SECOND` | Rate limit | Optional | Railway worker | No | Default `5`. |
| `QUEUE_MAX_ATTEMPTS` | Job retry cap | Optional | Vercel API, Railway | No | Default `3`. |
| `QUEUE_JOB_RETENTION_DAYS` | BullMQ retention | Optional | Vercel API, Railway | No | Default `7`. |
| `QUEUE_SIMULATION_DELAY_MS` | Simulated send delay | Optional | Railway worker | No | Default `25`. |
| `SPACEMAIL_IMAP_HOST` | Incoming mailbox IMAP host | Required for mailbox features | Vercel API | No | Must be `mail.spacemail.com`; Resend does not provide inbox/IMAP access. |
| `SPACEMAIL_IMAP_PORT` | IMAP port | Required for mailbox | Vercel API | No | `993` with `SPACEMAIL_IMAP_SECURE=true`. |
| `SPACEMAIL_IMAP_SECURE` | IMAP TLS | Required for mailbox | Vercel API | No | |
| `SPACEMAIL_EMAIL` | Incoming mailbox login / reply-to address | Required for mailbox | Vercel API | No | Outgoing From address is `RESEND_FROM_EMAIL`. |
| `SPACEMAIL_PASSWORD` | Mailbox password | Required for mailbox | Vercel API | **Yes** | |
| `SPACEMAIL_SENDER_NAME` | Display name for sends | Optional | Vercel API | No | |
| `MAIL_TEST_RECIPIENTS` | Optional allowlist for single-recipient test sends | Optional | Vercel API | No | Comma-separated; legacy `SPACEMAIL_TEST_RECIPIENTS` and `SPACEMAIL_TEST_RECIPIENT` are supported. |
| `USER_INVITATION_TTL_HOURS` | Admin invitation expiry | Optional | Vercel API | No | Default `48`. |
| `PORT` | HTTP listen port | Optional | Railway API only | No | Default `3001`; ignored by Vercel Functions. |
| `VERCEL` | Serverless flag | Auto | Vercel | No | Set by the platform. Forces a 1-connection pool and skips the access-control seed on the request path. |
| `APP_ENV_FILE` / `SENDSTACK_ENV_FILE` | Local env file path | Optional | Local CLI only | No | e.g. `.env.production` for scripts. |
| `BOOTSTRAP_ADMIN_*` | First super-admin CLI | Optional | Local CLI only | **Yes** (password) | Not for Vercel runtime; run `npm run bootstrap:admin` against production `DATABASE_URL` from a trusted machine. |
| `SECURITY_ROTATION_EMAIL` | Password rotation flag CLI | Optional | Local CLI | No | |
| `SENDSTACK_DB_RESET_CONFIRM` | Destructive DB reset guard | Optional | Local CLI | No | Must be `yes` to run `db:reset`. |
| `QUEUE_SIMULATION_FORCE_FAIL` | Test hook | Optional | Dev/test only | No | Do not set in production. |

### Resend sending domain

Verify a dedicated sending subdomain in Resend, publish the SPF/DKIM records Resend provides, and configure `RESEND_FROM_EMAIL` with an address on that verified subdomain. Use the records and status shown by Resend rather than copying DNS values from another account. A separate subdomain can isolate legitimate sending reputation; it must not be used to evade spam, abuse, or provider enforcement. Continue to send only appropriate mail to recipients with valid consent.

## Service matrix (minimum sets)

### Vercel — Production build

- `VITE_APP_URL`
- `VITE_CONTACT_EMAIL` (optional)

### Vercel — Production serverless API (`api/index.ts`)
All of **server core** from `server/env.ts`, plus queue vars if campaigns/queue UI are used, plus `RESEND_*` and `SPACEMAIL_*` if mailbox/composer features are used:

- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `FRONTEND_URL`
- `AUTH_EMAIL_DELIVERY`, `RESEND_*` (when using Resend for auth mail)
- `QUEUE_ENABLED`, `QUEUE_SIMULATION_ONLY`, `REDIS_URL`, `QUEUE_NAMESPACE`
- `RESEND_*` for outbound Resend mail; `SMTP_*` to enable Spacemail SMTP selection; `SPACEMAIL_IMAP_*`, `SPACEMAIL_EMAIL`, `SPACEMAIL_PASSWORD` only for inbox and sent-folder access.
- `APP_NAME`, `APP_COMPANY_NAME` (optional)

BullMQ **workers do not run inside Vercel Functions**; enqueue/API operations use Redis from Vercel; processing runs on Railway.

### Railway — email processing worker

`loadEnv()` + `loadQueueEnv()` — same **shared** credentials as API:

- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `FRONTEND_URL`
- `AUTH_EMAIL_DELIVERY` and its selected provider variables (required by schema even though worker does not send auth mail)
- `QUEUE_ENABLED=true`, `QUEUE_SIMULATION_ONLY=true`, `REDIS_URL`, `QUEUE_NAMESPACE`
- Optional queue tuning vars

Does **not** need `VITE_*` or `SPACEMAIL_*` for simulation processing.

### Railway — campaign dispatcher

Same as worker (no `SPACEMAIL_*` required for dispatch/simulation).

## Deployment compatibility notes

| Area | Status / notes |
| --- | --- |
| Hono on Vercel | `vercel.json` rewrites `/api/*` → `api/index.ts` (Node runtime, 30s max). |
| Better Auth | `basePath` `/api/auth`; production cookies `secure` + `httpOnly` + `sameSite=lax`. |
| CORS | Allowed browser origins from `authTrustedOrigins(FRONTEND_URL)`. |
| PostgreSQL | `postgres` driver with serverless-friendly pooling when `VERCEL` is set. |
| Redis | Required for queue enqueue/status when `QUEUE_ENABLED=true`. |
| IMAP | Runs in API handlers; subject to serverless timeouts (30s) — large mailboxes may need pagination limits in app code. |
| Individual send | Uses Resend; allowlist enforced in `assertAuthorizedParties`. |
| Campaign send | Simulation only while `QUEUE_SIMULATION_ONLY=true` (enforced in `queueEnvSchema`). |

## Validation

```bash
npm run env:check:production
# optional explicit file:
npm run env:check -- --production --file=.env.production
```

`npm run queue:check:production` validates Redis connectivity when queue is enabled (requires real `REDIS_URL`; do not run against production until credentials are final).

## Security checklist

- [ ] `.env.production` is gitignored (`.env.*` with `!.env.example`).
- [ ] `.env.production.example` contains no secrets (safe to commit).
- [ ] No secrets in `docs/` or `VITE_*` variables.
- [ ] Production URLs use HTTPS and align across `VITE_APP_URL`, `FRONTEND_URL`, `BETTER_AUTH_URL`.
- [ ] `QUEUE_SIMULATION_ONLY=true` in Vercel and Railway.
- [ ] Development `.env` credentials are not copied to production without a deliberate rotation strategy.
