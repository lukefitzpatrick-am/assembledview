-- 0014_revenue_forecast_targets_pg.sql
-- AUTHOR ONLY — apply to live Supabase before flipping forecast target writes to PG.
--
-- Natural key for Finance Forecast targets matches the former Xano upsert grain:
-- (clients_id, fy, line_key, month). Enables idempotent ON CONFLICT upserts.
-- Catalog already has unique(line_key).

CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_forecast_lines_natural_key
  ON revenue_forecast_lines (clients_id, fy, line_key, month);
