-- Migration 0113: clients channel fee columns (B22, decisions P3 and P12)
-- AUTHOR ONLY. Already applied by Luke on 2 Nov 2026 at 09:50:56 UTC
-- (8:50 pm Melbourne), marker 0113_clients_channel_fees. Do not re-run.
-- Do not drizzle-kit migrate. Repo copy only, added by B22 so the repo
-- matches the live database. The run file Luke used is kept, marked applied,
-- at sql/supabase/2026-11-02_0113_clients_channel_fees_SUPABASE.sql.
-- Idempotent: migration_markers guard. Running it again is a no-op.
--
-- Why: P3 (Luke, 2 Nov 2026). A client fee can apply to TV, radio,
-- newspapers, magazines, OOH, cinema, digital display, digital audio,
-- digital video, BVOD and integration, going forward. P12: Influencers gets
-- its own column too. The editor already read these 12 fields, but the
-- columns didn't exist, so every one of them was 0%.
--
-- What it adds: 12 nullable numeric columns on clients, whole percents
-- (20 = 20%), the same type as the 8 older fee columns. No default, no
-- comment, no constraint. No rows updated (no backfill, by rule): every
-- client reads null, which is 0% on the 11 channels. On Influencers, null
-- means the client's Content Creator rate (feeinfluencers ?? feecontentcreator).
--
-- ava_readonly already has table-level SELECT on clients (0003), so AVA can
-- read the columns with no new grant. RLS is unchanged.
--
-- Mirror: db/schema/ported.ts (B22), snapshot db/drizzle/0025. The columns
-- were live before the mirror, so the mirror can deploy in any order.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0113_clients_channel_fees') THEN
    RAISE NOTICE '0113 already applied - no-op';
    RETURN;
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
END
$$;
