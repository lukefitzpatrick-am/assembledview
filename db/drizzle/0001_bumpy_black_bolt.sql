CREATE TABLE "pacing_portfolio_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"as_of_date" date NOT NULL,
	"scope_key" text NOT NULL,
	"live_only" boolean NOT NULL,
	"rows" jsonb NOT NULL,
	"counts" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	CONSTRAINT "pacing_portfolio_snapshots_as_of_scope_live_key" UNIQUE("as_of_date","scope_key","live_only")
);
