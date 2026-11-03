-- Test lists for Settings → Test Message. Existing lists stay ordinary (is_test_list false).

ALTER TABLE "contact_lists" ADD COLUMN IF NOT EXISTS "is_test_list" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "test_message_operations" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "list_id" text,
  "list_name" text NOT NULL,
  "subject" text NOT NULL,
  "status" text NOT NULL,
  "requested_count" integer DEFAULT 0 NOT NULL,
  "eligible_count" integer DEFAULT 0 NOT NULL,
  "accepted_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "suppressed_count" integer DEFAULT 0 NOT NULL,
  "skipped_count" integer DEFAULT 0 NOT NULL,
  "recipient_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "test_message_operations" ADD CONSTRAINT "test_message_operations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "test_message_operations" ADD CONSTRAINT "test_message_operations_list_id_contact_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."contact_lists"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "test_message_operations_idempotency_key_unique" ON "test_message_operations" USING btree ("idempotency_key");
CREATE INDEX IF NOT EXISTS "test_message_operations_user_created_idx" ON "test_message_operations" USING btree ("user_id","created_at");

ALTER TABLE "mail_submissions" ADD COLUMN IF NOT EXISTS "operation_id" text;
ALTER TABLE "mail_submissions" ADD COLUMN IF NOT EXISTS "contact_id" text;

DO $$ BEGIN
 ALTER TABLE "mail_submissions" ADD CONSTRAINT "mail_submissions_operation_id_test_message_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."test_message_operations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "mail_submissions" ADD CONSTRAINT "mail_submissions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
