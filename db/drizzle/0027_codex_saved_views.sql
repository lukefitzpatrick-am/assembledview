CREATE TABLE "codex_saved_views" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "codex_saved_views_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"owner_email" text NOT NULL,
	"name" text NOT NULL,
	"screen" text NOT NULL,
	"lens" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"layout" text,
	"group_by" text,
	"shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
