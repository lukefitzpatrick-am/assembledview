-- Migration 0023: line_item_panels (OOH panel / pack detail)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS.
--
-- ONE table serves both buy shapes:
--   buy_granularity = 'panel' → 1:1 with its line item (large format / individually rated)
--   buy_granularity = 'pack'  → 1:N under one line item (pack / small format, one rate)
-- Granularity is per row (QMS sells both), never a publisher_profiles flag.
--
-- NO FK to a line-item parent: line items live across ~20 per-channel tables with no
-- single parent to reference. Join key is the line_item_id text string (same contract
-- as billing / pacing / schedule_months).
-- NO money on this table — spend stays on the burst / line item.
--
-- Flight (live in some periods, dark in others; bonus with no spend): see 0027
-- line_item_panel_flights (per-period child; jsonb alternative rejected).

CREATE TABLE IF NOT EXISTS public.line_item_panels (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  line_item_id text NOT NULL,
  mba_number text NOT NULL,
  buy_granularity text NOT NULL,
  latitude numeric,
  longitude numeric,
  publisher_format_name text,
  state text,
  site_number text,
  address_or_pack_details text,
  suburb text,
  -- TEXT: leading zeros are real (e.g. NT '0800').
  postcode text,
  direction text,
  geography text,
  format text,
  -- TEXT: publisher sizes are strings like "12.48m x 3.20m".
  size text,
  orientation text,
  digital_spec text,
  illumination text,
  digital_operating_hours text,
  rotation_seconds numeric,
  advertiser_share numeric,
  panel_name text,
  village_name text,
  panel_weight numeric,
  source_publisher text,
  source_row_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT line_item_panels_mba_number_lowercase
    CHECK (mba_number = lower(mba_number)),
  CONSTRAINT line_item_panels_buy_granularity_check
    CHECK (buy_granularity = ANY (ARRAY['panel'::text, 'pack'::text]))
);

CREATE INDEX IF NOT EXISTS idx_line_item_panels_mba
  ON public.line_item_panels (mba_number);

CREATE INDEX IF NOT EXISTS idx_line_item_panels_line_item_id
  ON public.line_item_panels (line_item_id);
