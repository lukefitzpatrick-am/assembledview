CREATE TABLE "site_watch_changes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "site_watch_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"site_id" bigint NOT NULL,
	"run_id" bigint NOT NULL,
	"url" text,
	"category" text NOT NULL,
	"field" text NOT NULL,
	"severity" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"diff" jsonb,
	"group_key" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" text,
	"acknowledged_by_name" text,
	"acknowledged_at" timestamp with time zone,
	"note" text,
	"teams_reported_at" timestamp with time zone,
	CONSTRAINT "site_watch_changes_category_check" CHECK ("site_watch_changes"."category" IN ('technical', 'tracking', 'content', 'visual')),
	CONSTRAINT "site_watch_changes_severity_check" CHECK ("site_watch_changes"."severity" IN ('critical', 'high', 'medium', 'low'))
);
--> statement-breakpoint
CREATE TABLE "site_watch_pages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "site_watch_pages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"site_id" bigint NOT NULL,
	"url" text NOT NULL,
	"fields" jsonb NOT NULL,
	"page_text" text,
	"layout" text,
	"fail_error" text,
	"last_run_id" bigint,
	"last_checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_watch_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "site_watch_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"site_id" bigint NOT NULL,
	"scan_date" date NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"page_urls" text[],
	"next_page" integer DEFAULT 0 NOT NULL,
	"css_hashes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pages_checked" integer DEFAULT 0 NOT NULL,
	"pages_changed" integer DEFAULT 0 NOT NULL,
	"pages_failed" integer DEFAULT 0 NOT NULL,
	"flags" text[] DEFAULT '{}' NOT NULL,
	"error" text,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "site_watch_runs_status_check" CHECK ("site_watch_runs"."status" IN ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "site_watch_sites" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "site_watch_sites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"client_id" bigint NOT NULL,
	"label" text NOT NULL,
	"base_url" text NOT NULL,
	"url_prefix" text,
	"sitemap_url" text,
	"robots_url" text,
	"key_urls" text[] DEFAULT '{}' NOT NULL,
	"page_limit" integer DEFAULT 100 NOT NULL,
	"ignore_selectors" text[] DEFAULT '{}' NOT NULL,
	"watch_text" boolean DEFAULT true NOT NULL,
	"watch_visual" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"robots_txt" text,
	"sitemap_urls" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_watch_sites_page_limit_check" CHECK ("site_watch_sites"."page_limit" BETWEEN 1 AND 500),
	CONSTRAINT "site_watch_sites_base_url_check" CHECK ("site_watch_sites"."base_url" ~* '^https?://')
);
--> statement-breakpoint
ALTER TABLE "site_watch_changes" ADD CONSTRAINT "site_watch_changes_site_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site_watch_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_watch_changes" ADD CONSTRAINT "site_watch_changes_run_fk" FOREIGN KEY ("run_id") REFERENCES "public"."site_watch_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_watch_pages" ADD CONSTRAINT "site_watch_pages_site_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site_watch_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_watch_runs" ADD CONSTRAINT "site_watch_runs_site_fk" FOREIGN KEY ("site_id") REFERENCES "public"."site_watch_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_watch_sites" ADD CONSTRAINT "site_watch_sites_client_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_watch_changes_site_detected_idx" ON "site_watch_changes" USING btree ("site_id","detected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "site_watch_changes_run_idx" ON "site_watch_changes" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_watch_pages_site_url_uq" ON "site_watch_pages" USING btree ("site_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "site_watch_runs_site_date_uq" ON "site_watch_runs" USING btree ("site_id","scan_date");--> statement-breakpoint
CREATE INDEX "site_watch_runs_status_idx" ON "site_watch_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "site_watch_sites_base_url_uq" ON "site_watch_sites" USING btree (lower("base_url"));--> statement-breakpoint
CREATE INDEX "site_watch_sites_client_idx" ON "site_watch_sites" USING btree ("client_id");