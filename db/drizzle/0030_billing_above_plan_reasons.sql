CREATE TABLE "billing_above_plan_reasons" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "billing_above_plan_reasons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"finance_billing_record_id" bigint NOT NULL,
	"reason" text NOT NULL,
	"covers_cents" bigint NOT NULL,
	"created_by" bigint NOT NULL,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_above_plan_reasons_reason_check" CHECK (char_length(btrim("billing_above_plan_reasons"."reason")) BETWEEN 1 AND 2000),
	CONSTRAINT "billing_above_plan_reasons_covers_cents_check" CHECK ("billing_above_plan_reasons"."covers_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "billing_above_plan_reasons" ADD CONSTRAINT "billing_above_plan_reasons_record_fk" FOREIGN KEY ("finance_billing_record_id") REFERENCES "public"."finance_billing_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_above_plan_reasons_record_idx" ON "billing_above_plan_reasons" USING btree ("finance_billing_record_id");