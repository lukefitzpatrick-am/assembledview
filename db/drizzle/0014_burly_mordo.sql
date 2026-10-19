CREATE TABLE "creative_preview_cache" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"creative_key" text NOT NULL,
	"client_id" bigint,
	"blob_pathname" text,
	"mime_type" text,
	"width" integer,
	"height" integer,
	"source" text NOT NULL,
	"source_ref" text,
	"fetched_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "creative_preview_cache_platform_key_uq" UNIQUE("platform","creative_key"),
	CONSTRAINT "creative_preview_cache_platform_chk" CHECK ("creative_preview_cache"."platform" in ('meta','tiktok','cm360')),
	CONSTRAINT "creative_preview_cache_source_chk" CHECK ("creative_preview_cache"."source" in ('platform','av_library','none'))
);
--> statement-breakpoint
CREATE TABLE "client_web_report_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"version" integer NOT NULL,
	"layout" jsonb NOT NULL,
	"saved_by" text,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_web_report_versions_report_version_uq" UNIQUE("report_id","version")
);
--> statement-breakpoint
CREATE TABLE "client_web_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigint NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"ga4_property_ref" text,
	"gsc_site_ref" text,
	"brand_terms" text[] DEFAULT '{}'::text[] NOT NULL,
	"default_period" text DEFAULT 'last_month' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" text,
	CONSTRAINT "client_web_reports_client_id_uq" UNIQUE("client_id"),
	CONSTRAINT "client_web_reports_status_chk" CHECK ("client_web_reports"."status" in ('draft','published')),
	CONSTRAINT "client_web_reports_default_period_chk" CHECK ("client_web_reports"."default_period" in ('last_month','last_28_days','month_to_date_yoy'))
);
--> statement-breakpoint
ALTER TABLE "client_platform_accounts" DROP CONSTRAINT "client_platform_accounts_platform_chk";--> statement-breakpoint
DROP INDEX "uq_report_runs_on_demand_inflight";--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "detail_level" text DEFAULT 'channel' NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_preview_cache" ADD CONSTRAINT "creative_preview_cache_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_web_report_versions" ADD CONSTRAINT "client_web_report_versions_report_id_client_web_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."client_web_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_web_reports" ADD CONSTRAINT "client_web_reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_report_runs_on_demand_inflight" ON "report_runs" USING btree ("kind","mba_number","period_start","detail_level") WHERE "report_runs"."kind" = 'on_demand_deck' AND "report_runs"."status" IN ('queued', 'generating');--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_detail_level_check" CHECK ("report_runs"."detail_level" IN ('channel', 'line_item', 'ad_group'));--> statement-breakpoint
ALTER TABLE "client_platform_accounts" ADD CONSTRAINT "client_platform_accounts_platform_chk" CHECK ("client_platform_accounts"."platform" in ('meta_ads','google_ads','cm360','dv360','tiktok','reddit','taboola','vistar','channel_factory','linkedin','pinterest','snapchat','ga4','gsc'));