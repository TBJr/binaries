# Audit log security

## Access control

- Permission: `audit.read` (see `server/auth/permissions.ts`)
- Enforced on every `/api/admin/audit*` route via `requirePermission`
- Navigation visibility is not sufficient; API checks are mandatory

## Data minimization

`sanitizeAuditMetadata()` strips keys such as passwords, tokens, SMTP/IMAP secrets, message bodies, and raw SMTP payloads.

Never log: passwords, session tokens, reset/invite tokens, 2FA secrets, recovery codes, full email bodies, CSV uploads, or request bodies on `api_mutation` rows.

## Immutability

- Application exposes **no** update/delete endpoints for audit rows
- Records are append-only through `recordAuditEvent` / `recordAudit`
- Database-level immutability is **not** enforced (DB admin can still mutate rows)

## Request context

IP and user agent are taken from `x-forwarded-for` / `x-real-ip` and `user-agent` (Vercel-compatible). Browser and OS are parsed server-side from the user agent into `metadata.client`. Optional hints: `Accept-Language` → `metadata.locale`, `cf-ipcountry` → `metadata.country`.

Each API request is assigned a `request_id` (also returned as `x-request-id`) so related audit rows can be correlated.

Actor identity is always derived from server session, not client JSON.

### What we cannot collect from a browser

**MAC addresses** (and other link-layer / hardware identifiers) are not available to a web SPA. HTTP does not expose them, and JavaScript in the browser cannot read them. Only on-prem agents or MDM software could supply a MAC, and client-supplied values would be spoofable—Binaries.nl does **not** accept or store MAC addresses from the client.

## Reliability

- Auth and `api_mutation` audit failures are swallowed (logged server-side) so UX is unaffected
- External SMTP outcomes are recorded on submission rows first; audit insert failures are logged and do not resend mail
- Critical admin mutations should move toward same-transaction audit where feasible (ongoing)

## Retention

No automatic deletion is configured. Define organizational retention separately before enabling cleanup jobs.
