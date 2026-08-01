-- Migration 0003: ava_readonly role + SELECT RLS policies (T3a)
-- Apply via Supabase SQL Editor / MCP after review — do NOT drizzle-kit migrate.
-- Idempotent: safe to re-run. Does NOT reset the role password on re-run.
--
-- GRANT SELECT is an EXPLICIT table allowlist (no ALL TABLES IN SCHEMA).
-- Future tables are excluded by default until added here + given an ava_read policy.
--
-- RLS is already enabled on all app tables (kickoff). Policies below open SELECT
-- only for ava_readonly on the allowlist. Unlisted tables stay fail-closed
-- (no GRANT + no policy → role reads nothing even if SELECT were granted later).

-- ---------------------------------------------------------------------------
-- 1. Role (create once; never overwrite password on re-run)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ava_readonly') THEN
    CREATE ROLE ava_readonly LOGIN PASSWORD '<SET_IN_DASHBOARD>'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE ava_readonly NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE ava_readonly SET statement_timeout = '5s';
ALTER ROLE ava_readonly SET default_transaction_read_only = on;

-- ---------------------------------------------------------------------------
-- 2. Connect + schema usage
-- ---------------------------------------------------------------------------
GRANT CONNECT ON DATABASE postgres TO ava_readonly;
GRANT USAGE ON SCHEMA public TO ava_readonly;

-- ---------------------------------------------------------------------------
-- 3. Explicit SELECT allowlist (39 tables)
--    Plans family, KPI, publishers/clients/audiences/creative/notes/domains/
--    clientdashboard, scope_of_work, reference tables, finance_*, revenue_*,
--    xero_*. Not granted: tasks*, pacing_orphan_fixes (and any future table).
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE
  -- plans family
  media_plan_masters,
  media_plan_versions,
  line_items,
  schedule_months,
  mba_fee_snapshots,
  billing_overrides,
  -- KPI
  campaign_kpi,
  client_kpi,
  publisher_kpi,
  -- clients / publishers / planning / creative
  publishers,
  clients,
  planning_audiences,
  creative_asset,
  client_notes,
  client_domains,
  clientdashboard,
  scope_of_work,
  -- reference tables
  audio_site,
  bvod_site,
  display_site,
  video_site,
  magazines,
  magazines_adsizes,
  newspapers,
  newspaper_adsizes,
  radio_stations,
  tv_stations,
  media_container_best_practice,
  -- finance_*
  finance_billing_line_items,
  finance_billing_records,
  finance_edits,
  finance_saved_views,
  -- revenue_*
  revenue_forecast_lines,
  revenue_line_catalog,
  -- xero_*
  xero_ap_bills,
  xero_ar_invoices,
  xero_contacts,
  xero_sync_exceptions,
  xero_sync_log
TO ava_readonly;

-- ---------------------------------------------------------------------------
-- 4. RLS SELECT policies (role is not owner → needs a policy to read)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ava_read ON media_plan_masters;
CREATE POLICY ava_read ON media_plan_masters FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON media_plan_versions;
CREATE POLICY ava_read ON media_plan_versions FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON line_items;
CREATE POLICY ava_read ON line_items FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON schedule_months;
CREATE POLICY ava_read ON schedule_months FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON mba_fee_snapshots;
CREATE POLICY ava_read ON mba_fee_snapshots FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON billing_overrides;
CREATE POLICY ava_read ON billing_overrides FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON campaign_kpi;
CREATE POLICY ava_read ON campaign_kpi FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON client_kpi;
CREATE POLICY ava_read ON client_kpi FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON publisher_kpi;
CREATE POLICY ava_read ON publisher_kpi FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON publishers;
CREATE POLICY ava_read ON publishers FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON clients;
CREATE POLICY ava_read ON clients FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON planning_audiences;
CREATE POLICY ava_read ON planning_audiences FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON creative_asset;
CREATE POLICY ava_read ON creative_asset FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON client_notes;
CREATE POLICY ava_read ON client_notes FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON client_domains;
CREATE POLICY ava_read ON client_domains FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON clientdashboard;
CREATE POLICY ava_read ON clientdashboard FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON scope_of_work;
CREATE POLICY ava_read ON scope_of_work FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON audio_site;
CREATE POLICY ava_read ON audio_site FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON bvod_site;
CREATE POLICY ava_read ON bvod_site FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON display_site;
CREATE POLICY ava_read ON display_site FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON video_site;
CREATE POLICY ava_read ON video_site FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON magazines;
CREATE POLICY ava_read ON magazines FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON magazines_adsizes;
CREATE POLICY ava_read ON magazines_adsizes FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON newspapers;
CREATE POLICY ava_read ON newspapers FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON newspaper_adsizes;
CREATE POLICY ava_read ON newspaper_adsizes FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON radio_stations;
CREATE POLICY ava_read ON radio_stations FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON tv_stations;
CREATE POLICY ava_read ON tv_stations FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON media_container_best_practice;
CREATE POLICY ava_read ON media_container_best_practice FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON finance_billing_line_items;
CREATE POLICY ava_read ON finance_billing_line_items FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON finance_billing_records;
CREATE POLICY ava_read ON finance_billing_records FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON finance_edits;
CREATE POLICY ava_read ON finance_edits FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON finance_saved_views;
CREATE POLICY ava_read ON finance_saved_views FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON revenue_forecast_lines;
CREATE POLICY ava_read ON revenue_forecast_lines FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON revenue_line_catalog;
CREATE POLICY ava_read ON revenue_line_catalog FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON xero_ap_bills;
CREATE POLICY ava_read ON xero_ap_bills FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON xero_ar_invoices;
CREATE POLICY ava_read ON xero_ar_invoices FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON xero_contacts;
CREATE POLICY ava_read ON xero_contacts FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON xero_sync_exceptions;
CREATE POLICY ava_read ON xero_sync_exceptions FOR SELECT TO ava_readonly USING (true);

DROP POLICY IF EXISTS ava_read ON xero_sync_log;
CREATE POLICY ava_read ON xero_sync_log FOR SELECT TO ava_readonly USING (true);
