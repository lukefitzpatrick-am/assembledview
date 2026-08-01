-- 0004_clients_missing_columns.sql
-- Port Xano clients fields missing from 0001 so AVA client_brain + social URLs survive a
-- DATA_BACKEND_CLIENTS=postgres flip. Apply via Supabase SQL Editor / MCP (same as 0001–0002).
-- Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- Note: idcm360 / iddv360 / idga4 already exist from 0001_ported_tables.sql — the IF NOT
-- EXISTS clauses below are intentional no-ops for those three (kept so this file matches
-- the full T2a.1 checklist verified against exports/xano/2026-07-30/clients.jsonl).

ALTER TABLE clients ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS facebook_url text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tiktok_url text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS idcm360 text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS iddv360 text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS idga4 text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_brain text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_brain_updated_at timestamptz;
