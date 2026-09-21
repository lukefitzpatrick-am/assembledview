CREATE TABLE "delivery_relabel_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"relabel_id" integer NOT NULL,
	"action" text NOT NULL,
	"actor_email" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_relabels" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"platform_entity_id" text NOT NULL,
	"entity_name" text,
	"from_line_item_id" text,
	"to_line_item_id" text NOT NULL,
	"mba_number" text NOT NULL,
	"date_from" date,
	"date_to" date,
	"reason" text NOT NULL,
	"actor_email" text NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"before_state" jsonb NOT NULL,
	"apply_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reverted_at" timestamp with time zone,
	"reverted_by_email" text
);
--> statement-breakpoint
ALTER TABLE "delivery_relabel_log" ADD CONSTRAINT "delivery_relabel_log_relabel_id_delivery_relabels_id_fk" FOREIGN KEY ("relabel_id") REFERENCES "public"."delivery_relabels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_relabel_log_relabel_idx" ON "delivery_relabel_log" USING btree ("relabel_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "delivery_relabels_mba_created_idx" ON "delivery_relabels" USING btree ("mba_number","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "delivery_relabels_entity_idx" ON "delivery_relabels" USING btree ("channel","platform_entity_id","created_at" DESC NULLS LAST);