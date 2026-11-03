ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "two_factor_enforcement_after" timestamp;

CREATE TABLE IF NOT EXISTS "twoFactor" (
  "id" text PRIMARY KEY NOT NULL,
  "secret" text NOT NULL,
  "backup_codes" text NOT NULL,
  "user_id" text NOT NULL,
  "verified" boolean DEFAULT true,
  "failed_verification_count" integer DEFAULT 0,
  "locked_until" timestamp,
  CONSTRAINT "twoFactor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "twoFactor_user_id_unique" ON "twoFactor" USING btree ("user_id");

ALTER TABLE "admin_audit_events" ADD COLUMN IF NOT EXISTS "event_type" text;
ALTER TABLE "admin_audit_events" ADD COLUMN IF NOT EXISTS "result" text DEFAULT 'success' NOT NULL;
ALTER TABLE "admin_audit_events" ADD COLUMN IF NOT EXISTS "ip_address" text;
ALTER TABLE "admin_audit_events" ADD COLUMN IF NOT EXISTS "user_agent" text;

ALTER TABLE "user_invitations" ADD COLUMN IF NOT EXISTS "invitee_name" text;

-- Grace period for existing super-administrators to enroll 2FA (does not force password reset).
-- Role keys are comma-separated (see parseRoleKeys in server/auth/permissions.ts).
UPDATE "user"
SET "two_factor_enforcement_after" = NOW() + INTERVAL '14 days'
WHERE "two_factor_enforcement_after" IS NULL
  AND COALESCE("banned", false) = false
  AND (
    "role" = 'super-admin'
    OR "role" LIKE 'super-admin,%'
    OR "role" LIKE '%,super-admin'
    OR "role" LIKE '%,super-admin,%'
  );
