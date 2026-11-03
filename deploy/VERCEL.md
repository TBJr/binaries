# Binaries.nl on Vercel (SPA + Hono API)

Deploy **Binaries.nl** as a separate Vercel project from any SendStack / CTN production project. Do not point this repo at original production credentials or domains.

## Architecture

- **Static SPA** from `dist/` (Vite build + prerender for public routes)
- **Hono API** via `api/index.ts` (Vercel Function, nested `/api/*` rewrites in `vercel.json`)
- **Better Auth** at `/api/auth/*` with HttpOnly cookies

## Vercel environment checklist

Copy from `.env.production` (local reference only — Vercel does not sync `.env.production` automatically):

- [ ] `APP_NAME`, `APP_COMPANY_NAME`
- [ ] `VITE_APP_URL` (Production + Preview; required at **build** time)
- [ ] `BETTER_AUTH_URL`, `FRONTEND_URL` (same origin as the public site)
- [ ] `BETTER_AUTH_SECRET` (unique production value, ≥ 32 characters)
- [ ] `DATABASE_URL` (Binaries.nl Neon — not SendStack)
- [ ] `REDIS_URL` (`rediss://…` Upstash TCP/TLS — not REST)
- [ ] `QUEUE_ENABLED`, `QUEUE_SIMULATION_ONLY=true`, `QUEUE_NAMESPACE`
- [ ] `AUTH_EMAIL_DELIVERY` + `SMTP_*` when auth emails should send via SMTP
- [ ] `SPACEMAIL_*` when mailbox/IMAP/composer send features are used
- [ ] Optional: `VITE_CONTACT_EMAIL`, `BOOTSTRAP_*` (bootstrap is local-only)

Do **not** set secrets with a `VITE_` prefix.

## Required environment variables

Set these in the Vercel project (Production and Preview as needed):

| Variable | Required | Example |
| --- | --- | --- |
| `DATABASE_URL` | Yes | New Neon PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | New random secret (≥ 32 chars) |
| `BETTER_AUTH_URL` | Yes | `https://your-domain.example` |
| `FRONTEND_URL` | Yes | Same public origin as the SPA |
| `VITE_APP_URL` | Yes (build) | Same origin — used at build time for canonical URLs |
| `QUEUE_SIMULATION_ONLY` | Yes | `true` (keep simulation-only) |
| `QUEUE_ENABLED` | Optional | `false` until Redis is configured |
| `REDIS_URL` | If queues enabled | New Upstash / Redis instance |

Optional branding: `APP_NAME`, `APP_COMPANY_NAME`, `VITE_CONTACT_EMAIL`.

Mailbox variables (`SPACEMAIL_*`) are only required when exercising SMTP/IMAP features.

## Build settings

Use repository defaults from `vercel.json`:

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Install command:** `npm install --include=dev` (required so `typescript`, `vite`, and other build tools in `devDependencies` are installed when `NODE_ENV=production`)

## Post-deploy checks

Replace `https://your-domain.example` with your deployment URL:

```bash
curl -sS https://your-domain.example/api/ping | jq .
curl -sS https://your-domain.example/api/health | jq .
curl -sS -D - --max-time 20 https://your-domain.example/api/auth/get-session
```

Sign in at `https://your-domain.example/login/` with an account created on **your** database (bootstrap locally or invite after deploy).

## Domain changes

Update `BETTER_AUTH_URL`, `FRONTEND_URL`, and `VITE_APP_URL` together when changing the canonical domain. Better Auth trusted origins derive from `FRONTEND_URL` (apex ↔ www pairs for public hostnames).
