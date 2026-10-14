CREATE TABLE "client_platform_accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigint NOT NULL,
	"platform" text NOT NULL,
	"account_ref" text NOT NULL,
	"label" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone,
	CONSTRAINT "client_platform_accounts_platform_chk" CHECK ("client_platform_accounts"."platform" in ('meta_ads','google_ads','cm360','dv360','tiktok','reddit','taboola','vistar','channel_factory','linkedin','pinterest','snapchat'))
);
--> statement-breakpoint
ALTER TABLE "report_runs" DROP CONSTRAINT "uq_report_runs_kind_mba_period";--> statement-breakpoint
ALTER TABLE "report_runs" ADD COLUMN "requested_by_email" text;--> statement-breakpoint
ALTER TABLE "client_platform_accounts" ADD CONSTRAINT "client_platform_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_client_platform_accounts_active_ref" ON "client_platform_accounts" USING btree ("platform",lower("account_ref")) WHERE "client_platform_accounts"."active";--> statement-breakpoint
CREATE INDEX "idx_client_platform_accounts_client_id" ON "client_platform_accounts" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_report_runs_kind_mba_period" ON "report_runs" USING btree ("kind","mba_number","period_start") WHERE "report_runs"."kind" <> 'on_demand_deck';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_report_runs_on_demand_inflight" ON "report_runs" USING btree ("kind","mba_number","period_start") WHERE "report_runs"."kind" = 'on_demand_deck' AND "report_runs"."status" IN ('queued', 'generating');