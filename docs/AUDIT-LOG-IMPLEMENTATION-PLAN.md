# Audit log implementation plan (Phase 7.7)

## Existing infrastructure (pre–7.7)

| Area | Status |
| --- | --- |
| Table `admin_audit_events` | Migration `0006_admin_access`; extended in `0008_security_hardening` (`event_type`, `result`, `ip_address`, `user_agent`) |
| `recordAudit()` in `server/services/admin.ts` | Used for user/role/invitation admin actions and password changes |
| `server/lib/security-audit.ts` | Metadata sanitization + action → event type heuristics |
| `server/services/auth-event-audit.ts` | Limited Better Auth POST success hooks |
| `server/services/campaign-audit.ts` | Separate `campaign_events` table (campaign lifecycle, not global audit UI) |
| `server/services/queue-events.ts` | Separate `queue_events` table for simulation pipeline |
| API `GET /api/admin/audit` | Pagination + basic filters; RBAC `audit.read` |
| UI `/app/admin/audit/` | Basic table; minimal filters |

## Gaps addressed in 7.7

- Central `recordAuditEvent()` + taxonomy (`server/lib/audit-taxonomy.ts`, `server/services/audit-log.ts`)
- Schema extension migration `0009_audit_log_phase_7_7.sql` (category, resource, description, request_id, actor_type, actor_email, indexes)
- Auth failure events (failed sign-in, 2FA verify failure) without credential leakage
- Email individual send outcomes (SMTP accepted / rejected / failed)
- Draft CRUD audit hooks
- Contact create/delete audit hooks
- Queue → audit mirror for simulation enqueue, cancel, terminal job failure; campaign simulation completed/failed summary
- API: summary, event detail, expanded filters (`category`, `result`, `q`, resource), max page size 100
- Audit Log UI: summary cards, URL-backed filters, pagination, detail sheet

## Still optional / follow-up

- Contact import, list CRUD, suppression, settings credential change events (partial coverage via admin actions)
- Atomic audit + mutation in every admin transaction (documented; not all paths use single tx yet)
- Retention/archival job (policy documented only)
- Unified view merging `campaign_events` / `queue_events` (mirrored selectively into `admin_audit_events`)

## Deployment

1. Run `npm run db:migrate` against each environment (includes `0009`).
2. No new environment variables.
3. `QUEUE_SIMULATION_ONLY=true` unchanged; Phase 8 not enabled.
