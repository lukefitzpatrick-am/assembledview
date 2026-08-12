-- Migration 0027: line_item_panel_flights (per-period panel presence)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS; ENABLE RLS is safe to re-run.
--
-- Child of line_item_panels (FK ON DELETE CASCADE is fine — panels are a single
-- parent, unlike line items which span ~20 channel tables).
--
-- NO money columns — spend stays on the burst / line item (standing rule).
-- jsonb flight windows were rejected: harder partial-flight queries, full-rewrite
-- updates, and shape drift. Prefer indexable period rows.
--
-- Letter → row convention (aligned with ingest bursts / interpretGridCell):
--   paid              → row, is_live=true,  is_bonus=false
--   bonus / bonus_display (B, STA) → row, is_live=true, is_bonus=true
--   unavailable (N/A, C/C) / blank / unmapped → NO row (same as bursts: no zero burst)
-- Contiguous same-status grid columns collapse to one flight with period_start of
-- the first column and period_end of the last (status-letter "run").

CREATE TABLE IF NOT EXISTS public.line_item_panel_flights (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  panel_id bigint NOT NULL REFERENCES public.line_item_panels(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  is_live boolean NOT NULL DEFAULT true,
  is_bonus boolean NOT NULL DEFAULT false,
  CONSTRAINT line_item_panel_flights_period_order
    CHECK (period_end >= period_start),
  CONSTRAINT line_item_panel_flights_panel_period_unique
    UNIQUE (panel_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_line_item_panel_flights_panel_id
  ON public.line_item_panel_flights (panel_id);

CREATE INDEX IF NOT EXISTS idx_line_item_panel_flights_period_start
  ON public.line_item_panel_flights (period_start);

ALTER TABLE public.line_item_panel_flights ENABLE ROW LEVEL SECURITY;
