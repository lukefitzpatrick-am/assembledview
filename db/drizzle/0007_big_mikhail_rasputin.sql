CREATE TABLE "relabel_drift_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"as_of_date" date NOT NULL,
	"findings" jsonb NOT NULL,
	"legacy_count" integer NOT NULL,
	"drift_count" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	CONSTRAINT "relabel_drift_snapshots_as_of_key" UNIQUE("as_of_date")
);
