# Binaries.nl

**Email, Organized.**

A modern email management platform built with React, TypeScript, and Hono, featuring email composition, Resend/IMAP integration, contacts, campaigns, and role-based access control.

- **Version:** 0.1.0
- **Status:** Independent development fork (derived from SendStack codebase; not connected to original CTN/SendStack production)

## Features

- React SPA with dashboard shell, composer (Tiptap), drafts, and preview
- Hono API on Node/Vercel Functions
- Better Auth (registration, login, password reset, email verification, manual verification)
- Roles and permissions with administrative audit log
- Contacts, lists, CSV import, suppressions, campaigns (queue simulation — no live bulk sending by default)
- Resend outbound mail with Spacemail IMAP inbox access
- BullMQ queue infrastructure (simulation-only guard)

## Technology stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS 4, shadcn/ui, React Router |
| Backend | Hono, Better Auth, Drizzle ORM, PostgreSQL (Neon) |
| Mail | Nodemailer, ImapFlow |
| Queue | BullMQ, Redis (optional) |
| Deploy | Vercel (SPA + `api/index.ts`) |

## Local setup

```bash
cp .env.example .env
# Edit .env — use a NEW Neon database and NEW BETTER_AUTH_SECRET (never copy SendStack production values)
npm install
npm run db:migrate
npm run dev
```

- **Client:** http://localhost:5173 (proxies `/api` to the API port)
- **API:** http://localhost:3001

### Bootstrap administrator

Creates the **first** super-administrator (Better Auth + `super-admin` role). Idempotent: safe to run twice.

```bash
# Required
export BOOTSTRAP_ADMIN_EMAIL=admin@example.com
export BOOTSTRAP_ADMIN_NAME=Administrator

# Optional — if omitted, a secure temporary password is generated and shown once
# export BOOTSTRAP_ADMIN_PASSWORD=

npm run bootstrap:admin
```

**Behavior**

- First successful run: creates the user, verifies email, assigns `super-admin`, syncs `app_user_roles`, and sets **must change password** on first login.
- If `BOOTSTRAP_ADMIN_PASSWORD` is unset: prints a **one-time temporary password** to the terminal (never stored in plaintext).
- If the email already exists: **SKIPPED** — no password reset, no role changes.
- If another super-admin already exists: **REFUSED** — use the in-app admin workflow to add users.
- **First login:** sign in, then complete `/app/change-password/` before other app features (enforced server-side).
- **Existing super-admin:** migration `0008_security_hardening.sql` grants a **14-day 2FA enrollment grace period** without forcing password reset. Optional rotation: `SECURITY_ROTATION_EMAIL=… npm run security:request-password-rotation` (does not change the password).
- **Production:** run only from a trusted CLI session; do not commit bootstrap env vars; clear shell history if a generated password was displayed.

### Security (password, 2FA, audit, invitations)

- **Settings → Security** (`/app/settings/security/`): TOTP 2FA, backup codes, password-change status.
- **Super-admin 2FA:** required after the grace deadline (`two_factor_enforcement_after` on `user`).
- **Audit log:** `/app/admin/audit/` or `/app/admin/audit-logs/` (filter by action, event type, actor).
- **User invitations:** `/app/admin/users/` — default expiry `USER_INVITATION_TTL_HOURS` (48).
- **Role signup links:** super admins can generate one-time links for `user`, `viewer`, `editor`, `campaign-manager`, and `admin` at `/app/admin/users/`. Signup codes expire after 7 days; super-admin accounts are excluded from public signup.
- **Transactional auth email:** set `AUTH_EMAIL_DELIVERY=resend`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` in production (`npm run env:check:production` rejects `console`).

(`npm run admin:bootstrap` is an alias for the same script.)

### Seed demo accounts

The built-in account types are `user`, `viewer`, `editor`, `campaign-manager`, `admin`, and `super-admin`. Start from `server/seeds/demo-users.example.json`, replace the placeholder `.invalid` addresses, and save the file as `server/seeds/demo-users.local.json` (ignored by Git). The seeder generates a temporary password for each new account, marks it verified, requires a password change at first login, and never modifies accounts that already exist.

After applying migrations, explicitly opt in when running the seeder. It creates a new, Git-ignored credentials file at `server/seeds/demo-users.credentials.local.json`; it refuses to overwrite an existing file and does not print passwords to the terminal:

```powershell
$env:SEED_DEMO_USERS = "true"
$env:SEED_DEMO_USERS_FILE = "server/seeds/demo-users.local.json"
npm run seed:demo-users
```

In production, also set `SEED_DEMO_USERS_CONFIRM_PRODUCTION=yes`. Run only from a trusted host with the intended production `DATABASE_URL`; protect the generated credentials file and deliver passwords securely. The super-admin seed is refused if an active super-admin already exists. This command does not apply migrations.

## Environment variables

See [`.env.example`](.env.example). Validate locally (never prints secrets):

```bash
npm run env:check
npm run env:check:production
```

Regenerate `.env` / `.env.production` auth secrets: `node scripts/configure-env.mjs` (backs up existing `.env` to `.env.backup.local`).

**Rotate `BETTER_AUTH_SECRET`:** generate a new value, update env + Vercel, redeploy — existing sessions and signed tokens may invalidate.

Key groups:

| Group | Variables |
| --- | --- |
| Branding | `APP_NAME`, `APP_COMPANY_NAME`, `VITE_APP_URL`, `VITE_CONTACT_EMAIL` |
| Auth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `FRONTEND_URL`, `AUTH_EMAIL_DELIVERY`, `RESEND_*` |
| Database | `DATABASE_URL` |
| Queue | `QUEUE_ENABLED`, `QUEUE_SIMULATION_ONLY`, `REDIS_URL`, `QUEUE_NAMESPACE` |
| Mailbox | `RESEND_*`, optional `SMTP_*` provider, optional `SPACEMAIL_IMAP_*` mailbox, optional `MAIL_TEST_RECIPIENTS` |

`BETTER_AUTH_URL` and `FRONTEND_URL` must match the origin users visit. Trusted origins include apex/www pairs for public domains.

## Database setup

1. Create a **new** Neon PostgreSQL database for Binaries.nl, or a local PostgreSQL database.
2. Set `DATABASE_URL` in `.env`. Use the Neon **pooled** URL (`-pooler` in the host) with `sslmode=require` for the app. For local PostgreSQL, `sslmode=disable` on `127.0.0.1` is fine.
3. Run `npm run db:migrate`.
4. Check connectivity without printing credentials: `npm run db:check`.
5. Optional: `npm run db:inspect` to list tables.

Connection timeouts, health checks, and local PostgreSQL are documented in [`docs/DATABASE-CONNECTIVITY.md`](docs/DATABASE-CONNECTIVITY.md).

Destructive reset (`npm run db:reset`) drops only allowlisted application tables and requires `SENDSTACK_DB_RESET_CONFIRM=yes`. It does not drop the Neon branch.

## Redis setup

Optional until you enable queues:

1. Create a **new** Redis instance (e.g. Upstash TCP URL `rediss://…`).
2. Set `REDIS_URL` and `QUEUE_ENABLED=true` on workers/dispatcher hosts.
3. Keep `QUEUE_SIMULATION_ONLY=true` unless you intentionally change sending policy.

Queue names default to `{QUEUE_NAMESPACE}-campaign-dispatch` and `{QUEUE_NAMESPACE}-email-processing` (default namespace: `kivorenta`).

## Email configuration

- **Auth emails:** `AUTH_EMAIL_DELIVERY=console` logs links in development.
- **Outbound mail:** set `RESEND_API_KEY` and a Resend-verified `RESEND_FROM_EMAIL`. Use a dedicated sending subdomain with Resend's SPF/DKIM DNS records to isolate legitimate sending reputation; this is not a way to bypass spam or abuse controls.
- **Operational mailbox:** configure `SPACEMAIL_IMAP_*`, `SPACEMAIL_EMAIL`, and `SPACEMAIL_PASSWORD` for inbox access. Resend handles outbound messages; Spacemail remains the inbound mailbox provider. Sender display name defaults to `APP_COMPANY_NAME` or `APP_NAME`.
- **Access:** only the **super admin** can view or change mailbox provider configuration (Resend/Spacemail). The system **admin** role can send controlled test messages from Mailbox settings without seeing provider or SMTP configuration.
- In Resend, verify your sending subdomain and publish the exact DNS records shown in its dashboard before sending. Use a valid sender on that subdomain and follow recipient-consent, unsubscribe, and provider policies.
- Do not use original SendStack mailbox credentials in this project.

## Vercel deployment

See [`deploy/VERCEL.md`](deploy/VERCEL.md). Use a **new** Vercel project, domain, Neon database, Redis instance, and secrets.

After deploy, `GET /api/health` should return a JSON service response, not HTML.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Client + API watch mode |
| `npm run build` | Production client + SSR prerender + typecheck project refs |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run db:migrate` | Drizzle migrations |
| `npm run db:check` | `SELECT 1` connectivity check (credentials redacted) |
| `npm run admin:bootstrap` | First super-admin |

## Known limitations

- Campaign delivery remains simulation-only while `QUEUE_SIMULATION_ONLY=true`.
- Legal pages are operator placeholders — obtain counsel-approved text before commercial use.
- Logo/imagery: typographic wordmark until approved brand assets exist.

## Provenance and licensing

This codebase was derived from the SendStack project. **No license file is included in this repository** — review upstream SendStack licensing and third-party dependency licenses before distribution. Preserve required open-source notices for bundled libraries (React, Hono, Better Auth, etc.) in your compliance process.

**Do not** connect this tree to SendStack production Neon, Redis, Vercel, or mailbox credentials.

Review applicable upstream and third-party license terms before redistribution.
