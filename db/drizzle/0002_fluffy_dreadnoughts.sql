ALTER TABLE "campaign_reads" DROP CONSTRAINT "campaign_reads_status_check";--> statement-breakpoint
ALTER TABLE "campaign_reads" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "campaign_reads" ADD CONSTRAINT "campaign_reads_status_check" CHECK ("campaign_reads"."status" = ANY (ARRAY['draft'::text, 'published'::text, 'generating'::text, 'failed'::text]));