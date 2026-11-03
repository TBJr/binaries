# Audit log event taxonomy

Canonical constants: `server/lib/audit-taxonomy.ts` (`AUDIT_ACTIONS`, `AUDIT_CATEGORIES`).

## Categories

`AUTHENTICATION`, `SECURITY`, `USER_MANAGEMENT`, `ROLE_MANAGEMENT`, `EMAIL`, `MAILBOX`, `DRAFT`, `CONTACT`, `RECIPIENT_LIST`, `SUPPRESSION`, `CAMPAIGN`, `QUEUE`, `SETTINGS`, `ADMINISTRATION`, `ACTIVITY`, `SYSTEM`.

## Representative actions

| Action | Category | Notes |
| --- | --- | --- |
| `auth_sign_in` / `auth_sign_in_failed` | AUTHENTICATION | All successful sign-ins; no password or email-existence hints on failure |
| `auth_sign_out` | AUTHENTICATION | |
| `password_changed` / `password_change_failed` | SECURITY | |
| `two_factor_*` | SECURITY | |
| `user.*`, `user_updated`, `invitation_*` | USER_MANAGEMENT | Existing admin flows |
| `role_*` | ROLE_MANAGEMENT | |
| `email_send_requested`, `email_smtp_accepted`, `email_smtp_rejected`, `email_smtp_failed` | EMAIL | Submission id + recipient count only |
| `draft_created` / `updated` / `deleted` | DRAFT | |
| `contact_created` / `contact_updated` / `contact_deleted` / `contacts_imported` | CONTACT | No PII in metadata |
| `contact_list_created` / `updated` / `deleted` | RECIPIENT_LIST | |
| `suppression_created` | SUPPRESSION | |
| `page_viewed` | ACTIVITY | SPA routes; server dedupes same actor+path within 30s |
| `api_mutation` | ACTIVITY | Authenticated `POST`/`PUT`/`PATCH`/`DELETE` on `/api/*` (skips auth, health, page-view). May accompany a domain-specific event |
| `admin_access_denied` | ADMINISTRATION | Permission check failures |
| `campaign_created` / `updated` / `duplicated` / `cancelled` / `reverted_to_draft` / `marked_ready` / `deleted` | CAMPAIGN | Mirrored from campaign lifecycle into the global audit log |
| `campaign_simulation_requested` | CAMPAIGN | Simulation only |
| `campaign_simulation_completed` / `failed` | CAMPAIGN | Worker summary |
| `queue_simulation_job_failed` | QUEUE | Terminal failures only |
| `settings_credentials_updated` | SETTINGS | Reserved; mailbox credentials are env-configured today (not an in-app mutation) |

Campaign-specific history remains in `campaign_events`; queue pipeline detail in `queue_events`. High-signal campaign lifecycle events are also written to `admin_audit_events`.

## Client context on every HTTP-originated event

When a request runs through API middleware, `recordAuditEvent` merges:

- `ip_address`, `user_agent`, `request_id` columns
- `metadata.client` — parsed browser, OS, device type (from User-Agent)
- `metadata.locale` — first `Accept-Language` value when present
- `metadata.country` — `cf-ipcountry` when present (CDN hint)

Worker/system events without an HTTP request leave these fields null.
