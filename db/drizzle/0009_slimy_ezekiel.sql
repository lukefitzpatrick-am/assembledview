ALTER TABLE "xero_sync_exceptions" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "xero_sync_exceptions" ADD COLUMN "resolved_by" text;--> statement-breakpoint
ALTER TABLE "xero_sync_exceptions" ADD COLUMN "resolution" text;