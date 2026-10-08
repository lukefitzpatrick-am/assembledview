CREATE TABLE "report_digest_sends" (
	"kind" text NOT NULL,
	"period_start" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recipients" text[] NOT NULL,
	"run_count" integer NOT NULL,
	CONSTRAINT "report_digest_sends_pkey" PRIMARY KEY("kind","period_start")
);
--> statement-breakpoint
CREATE TABLE "report_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'monthly_campaign' NOT NULL,
	"mba_number" text NOT NULL,
	"client_id" bigint,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"blob_pathname" text,
	"file_name" text,
	"error" text,
	"skip_reason" text,
	"commentary_generated" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "uq_report_runs_kind_mba_period" UNIQUE("kind","mba_number","period_start"),
	CONSTRAINT "report_runs_status_check" CHECK ("report_runs"."status" = ANY (ARRAY['queued'::text, 'generating'::text, 'generated'::text, 'failed'::text, 'skipped'::text]))
);
--> statement-breakpoint
ALTER TABLE "report_runs" ADD CONSTRAINT "report_runs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_report_runs_kind_period_status" ON "report_runs" USING btree ("kind","period_start","status");