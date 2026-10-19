CREATE TABLE "billing_partner_pack_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"mba_number" text NOT NULL,
	"version_id" bigint NOT NULL,
	"version_number" integer NOT NULL,
	"change_kind" text NOT NULL,
	"months_changed" jsonb,
	"back_dated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "billing_partner_pack_items_pack_id_version_id_key" UNIQUE("pack_id","version_id"),
	CONSTRAINT "billing_partner_pack_items_change_kind_check" CHECK ("billing_partner_pack_items"."change_kind" IN ('new', 'amended'))
);
--> statement-breakpoint
CREATE TABLE "billing_partner_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billing_month" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_by" text,
	"blob_pathname" text,
	"note" text,
	CONSTRAINT "billing_partner_packs_status_check" CHECK ("billing_partner_packs"."status" IN ('draft', 'sent'))
);
--> statement-breakpoint
ALTER TABLE "billing_partner_pack_items" ADD CONSTRAINT "billing_partner_pack_items_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "public"."billing_partner_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_partner_pack_items" ADD CONSTRAINT "billing_partner_pack_items_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."media_plan_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_billing_partner_pack_items_mba_number" ON "billing_partner_pack_items" USING btree ("mba_number");--> statement-breakpoint
CREATE INDEX "idx_billing_partner_pack_items_version_id" ON "billing_partner_pack_items" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "idx_billing_partner_packs_billing_month_status" ON "billing_partner_packs" USING btree ("billing_month","status");