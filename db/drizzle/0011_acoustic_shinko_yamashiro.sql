ALTER TABLE "campaign_insights" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "campaign_insights" ADD COLUMN "action_owner" text;--> statement-breakpoint
ALTER TABLE "campaign_insights" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "campaign_insights" ADD COLUMN "outcome_kind" text;--> statement-breakpoint
ALTER TABLE "campaign_insights" ADD CONSTRAINT "campaign_insights_outcome_kind_check" CHECK ("campaign_insights"."outcome_kind" IS NULL OR "campaign_insights"."outcome_kind" = ANY (ARRAY['achieved'::text, 'expected'::text]));