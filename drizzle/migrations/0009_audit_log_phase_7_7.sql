-- Phase 7.7 — extend admin audit log for categorization and resource traceability

ALTER TABLE "admin_audit_events" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "admin_audit_events" ADD COLUMN IF NOT EXISTS "resource_type" text;
ALTER TABLE "admin_audit_events" ADD COLUMN IF NOT EXISTS "resource_id" text;
ALTER TABLE "admin_audit_events" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "admin_audit_events" ADD COLUMN IF NOT EXISTS "request_id" text;
ALTER TABLE "admin_audit_events" ADD COLUMN IF NOT EXISTS "actor_type" text DEFAULT 'user' NOT NULL;
ALTER TABLE "admin_audit_events" ADD COLUMN IF NOT EXISTS "actor_email" text;

CREATE INDEX IF NOT EXISTS "admin_audit_events_event_type_idx" ON "admin_audit_events" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "admin_audit_events_category_idx" ON "admin_audit_events" USING btree ("category");
CREATE INDEX IF NOT EXISTS "admin_audit_events_result_idx" ON "admin_audit_events" USING btree ("result");
CREATE INDEX IF NOT EXISTS "admin_audit_events_resource_idx" ON "admin_audit_events" USING btree ("resource_type", "resource_id");
