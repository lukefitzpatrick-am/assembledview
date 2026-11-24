CREATE TABLE "data_quality_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "data_quality_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"rule_key" text NOT NULL,
	"mba_number" text NOT NULL,
	"line_item_id" text,
	"client_id" bigint,
	"message" text NOT NULL,
	"fix_label" text NOT NULL,
	"fix_href" text NOT NULL,
	"owner_email" text,
	"status" text DEFAULT 'open' NOT NULL,
	"dismiss_reason" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	CONSTRAINT "data_quality_items_rule_key_check" CHECK (char_length("data_quality_items"."rule_key") BETWEEN 1 AND 100),
	CONSTRAINT "data_quality_items_mba_number_check" CHECK (btrim("data_quality_items"."mba_number") <> ''),
	CONSTRAINT "data_quality_items_message_check" CHECK (char_length("data_quality_items"."message") BETWEEN 1 AND 2000),
	CONSTRAINT "data_quality_items_fix_label_check" CHECK (char_length("data_quality_items"."fix_label") BETWEEN 1 AND 200),
	CONSTRAINT "data_quality_items_fix_href_check" CHECK ("data_quality_items"."fix_href" LIKE '/%' AND "data_quality_items"."fix_href" NOT LIKE '//%'),
	CONSTRAINT "data_quality_items_owner_email_check" CHECK ("data_quality_items"."owner_email" IS NULL OR "data_quality_items"."owner_email" = lower("data_quality_items"."owner_email")),
	CONSTRAINT "data_quality_items_status_check" CHECK ("data_quality_items"."status" IN ('open', 'resolved', 'dismissed')),
	CONSTRAINT "data_quality_items_dismiss_reason_check" CHECK ("data_quality_items"."status" <> 'dismissed' OR char_length(btrim(coalesce("data_quality_items"."dismiss_reason", ''))) BETWEEN 1 AND 1000),
	CONSTRAINT "data_quality_items_resolved_check" CHECK (("data_quality_items"."status" = 'open') = ("data_quality_items"."resolved_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "data_quality_items" ADD CONSTRAINT "data_quality_items_client_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_quality_items_open_key" ON "data_quality_items" USING btree ("rule_key","mba_number",(coalesce("line_item_id", ''))) WHERE "data_quality_items"."status" = 'open';--> statement-breakpoint
CREATE INDEX "data_quality_items_status_owner_idx" ON "data_quality_items" USING btree ("status","owner_email");