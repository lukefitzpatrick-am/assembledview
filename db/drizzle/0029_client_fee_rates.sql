CREATE TABLE "client_fee_rates" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "client_fee_rates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"client_id" bigint NOT NULL,
	"fee_field" text NOT NULL,
	"rate_pct" numeric NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "client_fee_rates_client_field_from_unique" UNIQUE("client_id","fee_field","effective_from"),
	CONSTRAINT "client_fee_rates_fee_field_check" CHECK ("client_fee_rates"."fee_field" IN ('feetelevision', 'feeradio', 'feenewspapers', 'feemagazines', 'feeooh', 'feecinema', 'feedigidisplay', 'feedigiaudio', 'feedigivideo', 'feebvod', 'feeintegration', 'feesearch', 'feesocial', 'feeprogdisplay', 'feeprogvideo', 'feeprogbvod', 'feeprogaudio', 'feeprogooh', 'feeinfluencers', 'feecontentcreator')),
	CONSTRAINT "client_fee_rates_rate_pct_check" CHECK ("client_fee_rates"."rate_pct" >= 0 AND "client_fee_rates"."rate_pct" <= 100)
);
--> statement-breakpoint
ALTER TABLE "client_fee_rates" ADD CONSTRAINT "client_fee_rates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;