-- Migration 0120: client_fee_rates (client fee rates with effective dates, S4)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- The guarded run file for Luke is sql/supabase/2026-11-23_0120_client_fee_rates_SUPABASE.sql
-- (same DDL, with BEFORE and AFTER checks). Run that one.
-- Idempotent: migration_markers guard.
--
-- Why: decision S4 A (Luke, 17 Nov 2026). A client fee rate has a date it
-- takes effect from, so a rate change reaches plans that start on or after
-- that date, not every plan the next time it is saved.
--
-- What it adds: public.client_fee_rates, one row per dated rate change:
-- client_id (clients, cascade), fee_field (one of the 20 client fee columns,
-- lib/finance/clientFeeChannels.ts), rate_pct (whole percent, 0 to 100),
-- effective_from (a Melbourne civil date), created_at, created_by.
-- Unique (client_id, fee_field, effective_from).
--
-- The rule (lib/finance/clientFeeChannels.ts clientFeeRateOn): the rate for
-- a client, field and date is the latest row on or before that date; with
-- none, the clients column. So the clients column is the rate before the
-- first dated change, and no first row is needed. Empty, no backfill, no
-- client row changes.
--
-- RLS on, no policies (server connection only), no ava_readonly grant: Ava
-- keeps reading today's rate from clients.
--
-- Mirror: db/schema/clientFeeRates.ts (clientFeeRates), snapshot db/drizzle/0029.
-- Read only with the switch client_fee_rate_history on, which can't be
-- turned on until the marker exists, so the mirror can deploy in any order.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0120_client_fee_rates') THEN
    RAISE NOTICE '0120 already applied - no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.client_fee_rates (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id      bigint NOT NULL,
    fee_field      text NOT NULL,
    rate_pct       numeric NOT NULL,
    effective_from date NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     text,
    CONSTRAINT client_fee_rates_fee_field_check CHECK (fee_field IN (
      'feetelevision', 'feeradio', 'feenewspapers', 'feemagazines', 'feeooh', 'feecinema',
      'feedigidisplay', 'feedigiaudio', 'feedigivideo', 'feebvod', 'feeintegration',
      'feesearch', 'feesocial', 'feeprogdisplay', 'feeprogvideo', 'feeprogbvod',
      'feeprogaudio', 'feeprogooh', 'feeinfluencers', 'feecontentcreator')),
    CONSTRAINT client_fee_rates_client_id_clients_id_fk FOREIGN KEY (client_id)
      REFERENCES public.clients(id) ON DELETE CASCADE,
    CONSTRAINT client_fee_rates_rate_pct_check CHECK (rate_pct >= 0 AND rate_pct <= 100),
    CONSTRAINT client_fee_rates_client_field_from_unique UNIQUE (client_id, fee_field, effective_from)
  );

  COMMENT ON TABLE public.client_fee_rates IS
    'Client fee rate changes with an effective-from Melbourne date (S4). The rate on a date is the latest row on or before it, else the clients column.';

  ALTER TABLE public.client_fee_rates ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES ('0120_client_fee_rates', 'client_fee_rates (client fee rates with effective dates, S4). Empty, RLS on, no ava grant.');
END
$$;
