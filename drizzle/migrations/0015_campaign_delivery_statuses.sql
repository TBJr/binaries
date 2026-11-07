ALTER TABLE "delivery_jobs" DROP CONSTRAINT IF EXISTS "delivery_jobs_status_check";
--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_status_check" CHECK ("status" IN (
  'pending',
  'queued',
  'processing',
  'retry_wait',
  'simulation_completed',
  'simulation_failed',
  'delivered',
  'send_failed',
  'skipped',
  'cancelled'
));
--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD COLUMN IF NOT EXISTS "provider_message_id" text;
