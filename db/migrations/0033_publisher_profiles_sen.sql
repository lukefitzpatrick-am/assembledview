-- Migration 0033: seed SEN publisher_profiles row (MR ingest — fourth publisher).
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: ON CONFLICT (publisher_name) DO UPDATE.
--
-- Fixture: tests/fixtures/ava-plans/sen_boss-engineering_fy26.xlsx
-- (macro-era SEN schedules are .xlsm; ExcelJS reads sheet data the same way —
-- macros ignored, workbook not mutated).
-- RLS (0026) unchanged — app writes as table owner; no new policies.

INSERT INTO public.publisher_profiles (
  publisher_name, media_type, active, detect_signature, column_map,
  grid_semantics, legend_map, sheet_rules, notes
) VALUES (
  'SEN',
  'radio',
  true,
  '{"header_text_includes":["MEDIA SCHEDULE","ENTITLEMENT","LENGTH"],"metadata_labels":["BOOKING CONFIRMATION","ABN:"],"grouping_keys":["station","media_description","length"]}'::jsonb,
  '{"MEDIA SCHEDULE (Week commencing Monday)":"station","ENTITLEMENT":"media_description","LENGTH":"length"}'::jsonb,
  'count',
  '{}'::jsonb,
  '[{"match":{"any_line_item_sheet":true},"role":"line_items","default_booking_status":"paid"}]'::jsonb,
  'Radio spot-count grid (OPTION 2). State grouping rows stack into market. CS–DP 1900-date junk band is not part of the detected flight grid.'
)
ON CONFLICT (publisher_name) DO UPDATE SET
  media_type = EXCLUDED.media_type,
  active = EXCLUDED.active,
  detect_signature = EXCLUDED.detect_signature,
  column_map = EXCLUDED.column_map,
  grid_semantics = EXCLUDED.grid_semantics,
  legend_map = EXCLUDED.legend_map,
  sheet_rules = EXCLUDED.sheet_rules,
  notes = EXCLUDED.notes,
  updated_at = now();
