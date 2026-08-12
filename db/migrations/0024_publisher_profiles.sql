-- Migration 0024: publisher_profiles (MR ingest config — not code)
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE IF NOT EXISTS + seed ON CONFLICT (publisher_name).
--
-- Mapping lives in rows. A new publisher is an INSERT, not a deploy.
-- grid_semantics is load-bearing: status_matrix (OOH letters) vs count (radio spots)
-- vs currency — reading 'B' as a quantity corrupts every downstream figure.
-- Do NOT assume one sheet per file — sheet_rules declare line-item sheets.

CREATE TABLE IF NOT EXISTS public.publisher_profiles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  publisher_name text NOT NULL,
  media_type text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  detect_signature jsonb NOT NULL DEFAULT '{}'::jsonb,
  column_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  grid_semantics text NOT NULL,
  legend_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  sheet_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publisher_profiles_publisher_name_unique UNIQUE (publisher_name),
  CONSTRAINT publisher_profiles_grid_semantics_check
    CHECK (grid_semantics = ANY (ARRAY['status_matrix'::text, 'count'::text, 'currency'::text]))
);

CREATE INDEX IF NOT EXISTS idx_publisher_profiles_media_type
  ON public.publisher_profiles (media_type);

CREATE INDEX IF NOT EXISTS idx_publisher_profiles_active
  ON public.publisher_profiles (active)
  WHERE active = true;

-- Seed: QMS, SCA, JCDecaux (fixtures under tests/fixtures/ava-plans/).
INSERT INTO public.publisher_profiles (
  publisher_name, media_type, active, detect_signature, column_map,
  grid_semantics, legend_map, sheet_rules, notes
) VALUES (
  'QMS',
  'ooh',
  true,
  '{"header_text_includes":["LATITUDE","QMS FORMAT","SITE NUMBER"],"legend_codes":["p","B","STA","N/A"]}'::jsonb,
  '{"LATITUDE":"latitude","LONGITUDE":"longitude","QMS FORMAT":"publisher_format_name","STATE":"state","SITE NUMBER / NO. OF PANELS":"site_number","ADDRESS / PACK DETAILS":"address_or_pack_details","SUBURB":"suburb","POSTCODE":"postcode","DIRECTION":"direction","GEOGRAPHY":"geography","FORMAT":"format","SIZE":"size","PORTRAIT / LANDSCAPE":"orientation","DIGITAL SPECS (WxH)":"digital_spec","SHARE OF TIME":"advertiser_share","AD DURATION (SECS)":"rotation_seconds","ILLUMINATION (HOURS)":"digital_operating_hours","ILLUMINATION":"illumination"}'::jsonb,
  'status_matrix',
  '{"p":"paid","B":"bonus","STA":"bonus_display","N/A":"unavailable"}'::jsonb,
  '[{"match":{"name_includes":"Paid"},"role":"line_items","default_booking_status":"paid"},{"match":{"name_includes":"Bonus"},"role":"line_items","default_booking_status":"bonus"},{"match":{"name_includes":"Summary"},"role":"ignore"}]'::jsonb,
  'OOH status letters in the flight grid. Paid and Bonus are separate sheets.'
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

INSERT INTO public.publisher_profiles (
  publisher_name, media_type, active, detect_signature, column_map,
  grid_semantics, legend_map, sheet_rules, notes
) VALUES (
  'SCA',
  'radio',
  true,
  '{"header_text_includes":["Media Description","Daypart"],"metadata_labels":["Agency:","Client:","Campaign:"]}'::jsonb,
  '{"Media Description":"media_description","Length":"length","Days":"days","Daypart":"daypart"}'::jsonb,
  'count',
  '{}'::jsonb,
  '[{"match":{"name_includes":"R+F"},"role":"ignore"},{"match":{"name_includes":"Reach"},"role":"ignore"},{"match":{"name_includes":"Audience"},"role":"ignore"},{"match":{"name_includes":"Double Check"},"role":"ignore"},{"match":{"any_line_item_sheet":true},"role":"line_items","default_booking_status":"paid"}]'::jsonb,
  'Radio spot-count grid. Reach & Frequency / R+F is not line items.'
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

INSERT INTO public.publisher_profiles (
  publisher_name, media_type, active, detect_signature, column_map,
  grid_semantics, legend_map, sheet_rules, notes
) VALUES (
  'JCDecaux',
  'ooh',
  true,
  '{"header_text_includes":["Panel #","Panel Name","Digital Rotation Seconds"],"legend_codes":["p","B","STA","C/C","N/A"]}'::jsonb,
  '{"Panel #":"site_number","Panel Name":"panel_name","Village Name / Panel Weights":"village_name","Suburb / Transit Depot":"suburb","State":"state","Area":"geography","Dimensions":"size","Illumination":"illumination","Digital Operation Hours":"digital_operating_hours","Digital Rotation Seconds":"rotation_seconds","Advertiser Share-of-Time":"advertiser_share","Direction":"direction"}'::jsonb,
  'status_matrix',
  '{"p":"paid","B":"bonus","STA":"bonus_display","C/C":"unavailable","N/A":"unavailable"}'::jsonb,
  '[{"match":{"any_line_item_sheet":true},"role":"line_items","default_booking_status":"paid"}]'::jsonb,
  'OOH status matrix. Village weight shares a header with village name — weight not separately mapped.'
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
