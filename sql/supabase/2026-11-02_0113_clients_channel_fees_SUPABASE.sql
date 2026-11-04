-- 0113_clients_channel_fees: run file for Luke. APPLIED, do not re-run.
-- Supabase project slpdibnxtpdlttbbczvg. Luke ran this by hand in the SQL
-- Editor on 2 Nov 2026 at 09:50:56 UTC (8:50 pm Melbourne). The marker
-- 0113_clients_channel_fees records it. Kept for the record (B22).
-- Same DDL as db/migrations/0113_clients_channel_fees.sql (the repo copy, AUTHOR ONLY).
-- Source: plans PACK-AV-tonight-sql-and-answers-2026-11-02, SQL 1.
--
-- What it did
--   Added 12 nullable numeric columns on public.clients (whole percents,
--   20 = 20%): feetelevision, feeradio, feenewspapers, feemagazines, feeooh,
--   feecinema, feedigidisplay, feedigiaudio, feedigivideo, feebvod,
--   feeintegration, feeinfluencers. Wrote the marker. Updated no rows.
--
-- Running the DO block again raises "already exists - nothing done" and
-- changes nothing. The CHECK query at the end is read only and safe.

-- ===================== CHANGE (applied 2 Nov 2026) =====================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0113_clients_channel_fees') THEN
    RAISE EXCEPTION 'marker 0113_clients_channel_fees already exists - nothing done';
  END IF;
  ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS feetelevision   numeric,
    ADD COLUMN IF NOT EXISTS feeradio        numeric,
    ADD COLUMN IF NOT EXISTS feenewspapers   numeric,
    ADD COLUMN IF NOT EXISTS feemagazines    numeric,
    ADD COLUMN IF NOT EXISTS feeooh          numeric,
    ADD COLUMN IF NOT EXISTS feecinema       numeric,
    ADD COLUMN IF NOT EXISTS feedigidisplay  numeric,
    ADD COLUMN IF NOT EXISTS feedigiaudio    numeric,
    ADD COLUMN IF NOT EXISTS feedigivideo    numeric,
    ADD COLUMN IF NOT EXISTS feebvod         numeric,
    ADD COLUMN IF NOT EXISTS feeintegration  numeric,
    ADD COLUMN IF NOT EXISTS feeinfluencers  numeric;
  INSERT INTO public.migration_markers (key, note)
  VALUES ('0113_clients_channel_fees', 'clients fee columns for TV, radio, newspapers, magazines, OOH, cinema, digital display/audio/video, BVOD, integration, influencers. Nullable numeric percent, no backfill.');
END $$;

-- ===================== CHECK (read only) =====================
-- Expect 12 rows, all numeric, nullable.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clients'
  AND column_name IN ('feetelevision','feeradio','feenewspapers','feemagazines','feeooh','feecinema',
                      'feedigidisplay','feedigiaudio','feedigivideo','feebvod','feeintegration','feeinfluencers')
ORDER BY column_name;
