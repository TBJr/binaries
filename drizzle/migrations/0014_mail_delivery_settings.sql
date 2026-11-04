CREATE TABLE IF NOT EXISTS "mail_delivery_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL DEFAULT 'resend',
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail_delivery_settings_provider_check" CHECK ("provider" IN ('resend', 'spacemail'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_delivery_settings" ADD CONSTRAINT "mail_delivery_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
