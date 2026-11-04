CREATE TABLE IF NOT EXISTS "signup_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"role_key" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "signup_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signup_codes" ADD CONSTRAINT "signup_codes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signup_codes_created_by_created_at_idx" ON "signup_codes" USING btree ("created_by","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signup_codes_expires_at_idx" ON "signup_codes" USING btree ("expires_at");
