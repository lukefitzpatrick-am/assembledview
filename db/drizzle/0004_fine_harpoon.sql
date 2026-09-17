CREATE TABLE "pacing_scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"mba_number" text NOT NULL,
	"version_number" integer NOT NULL,
	"name" text NOT NULL,
	"levers" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_by_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pacing_scenarios_mba_created_idx" ON "pacing_scenarios" USING btree ("mba_number","created_at" DESC NULLS LAST);