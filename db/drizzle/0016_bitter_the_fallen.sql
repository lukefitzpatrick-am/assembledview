CREATE TABLE "web_kpi_targets" (
	"kpi_id" uuid NOT NULL,
	"month" date NOT NULL,
	"target" numeric(14, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "web_kpi_targets_pkey" PRIMARY KEY("kpi_id","month"),
	CONSTRAINT "web_kpi_targets_month_check" CHECK (EXTRACT(DAY FROM "web_kpi_targets"."month") = 1),
	CONSTRAINT "web_kpi_targets_target_check" CHECK ("web_kpi_targets"."target" >= 0)
);
--> statement-breakpoint
CREATE TABLE "web_kpis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" bigint NOT NULL,
	"label" text NOT NULL,
	"source" text NOT NULL,
	"event_names" text[],
	"metric" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "web_kpis_source_check" CHECK ("web_kpis"."source" IN ('ga4_event', 'ga4_metric', 'gsc_metric')),
	CONSTRAINT "web_kpis_metric_check" CHECK ("web_kpis"."metric" IS NULL OR "web_kpis"."metric" IN ('sessions', 'engaged_sessions', 'key_events', 'page_views', 'clicks', 'impressions')),
	CONSTRAINT "web_kpis_source_fields_check" CHECK (("web_kpis"."source" = 'ga4_event' AND "web_kpis"."event_names" IS NOT NULL AND cardinality("web_kpis"."event_names") >= 1 AND "web_kpis"."metric" IS NULL) OR ("web_kpis"."source" = 'ga4_metric' AND "web_kpis"."metric" IN ('sessions', 'engaged_sessions', 'key_events', 'page_views') AND "web_kpis"."event_names" IS NULL) OR ("web_kpis"."source" = 'gsc_metric' AND "web_kpis"."metric" IN ('clicks', 'impressions') AND "web_kpis"."event_names" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "web_kpi_targets" ADD CONSTRAINT "web_kpi_targets_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "public"."web_kpis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_kpis" ADD CONSTRAINT "web_kpis_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_web_kpis_client_id_active" ON "web_kpis" USING btree ("client_id","active");