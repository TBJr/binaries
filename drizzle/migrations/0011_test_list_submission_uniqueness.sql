-- One intended SMTP submission per recipient identity inside a test-list operation.
-- Existing mail_submissions rows keep a null operation_id and are not covered by these indexes.

ALTER TABLE "test_message_operations" ADD COLUMN IF NOT EXISTS "unknown_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "test_message_operations" ADD COLUMN IF NOT EXISTS "not_attempted_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "test_message_operations" ADD COLUMN IF NOT EXISTS "failure_category" text;

CREATE UNIQUE INDEX IF NOT EXISTS "mail_submissions_operation_contact_unique"
  ON "mail_submissions" ("operation_id", "contact_id")
  WHERE "operation_id" IS NOT NULL AND "contact_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "mail_submissions_operation_email_unique"
  ON "mail_submissions" ("operation_id", lower("to_address"))
  WHERE "operation_id" IS NOT NULL;
