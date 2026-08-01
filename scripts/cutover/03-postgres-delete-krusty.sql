-- KR-1 Postgres deletion — Supabase project slpdibnxtpdlttbbczvg
-- AUTHOR APPLY ONLY (Claude via MCP after Luke finishes Xano).
-- Wrapped in a single transaction. Rolls back on error.
--
-- PREREQS:
--   1. scripts/cutover/01-export-krusty-fixture.ts has written a fixture JSON
--   2. 00-discover-matches.sql reviewed; paste MBA/client lists into comments below
--   3. 04-precount.sql run; ledger filled
--
-- MATCH (same as discovery — no undeclared wildcards):
--   MBA: lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%'
--   Client: mbaidentifier exact/prefix krusty|krabby OR mp_client_name contains those tokens
--
-- LIVE ENUMERATION (fill from STEP 0 before COMMIT — example shape only):
--   mba_numbers: <paste>
--   client_ids:  <paste>
--   client_names / mbaidentifiers: <paste>

BEGIN;

-- ---------------------------------------------------------------------------
-- Build match sets (authoritative for this transaction)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE kr1_mbas ON COMMIT DROP AS
SELECT DISTINCT lower(mba_number) AS mba_number
FROM (
  SELECT mba_number FROM media_plan_masters
  WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%'
  UNION
  SELECT mba_number FROM media_plan_versions
  WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%'
  UNION
  SELECT mba_number FROM campaign_kpi
  WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
     OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
  UNION
  SELECT mba_number FROM mba_line_approvals
  WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%'
  UNION
  SELECT mba_number FROM finance_billing_records
  WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
     OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
  UNION
  SELECT mba_number FROM creative_asset
  WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
     OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
  UNION
  SELECT mba_number FROM planning_audiences
  WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
     OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
) s
WHERE mba_number IS NOT NULL AND length(trim(mba_number)) > 0;

CREATE TEMP TABLE kr1_clients ON COMMIT DROP AS
SELECT id AS client_id,
       mp_client_name,
       mbaidentifier
FROM clients
WHERE lower(coalesce(mbaidentifier, '')) IN ('krusty', 'krabby')
   OR lower(coalesce(mbaidentifier, '')) LIKE 'krusty%'
   OR lower(coalesce(mbaidentifier, '')) LIKE 'krabby%'
   OR lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
   OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%';

CREATE TEMP TABLE kr1_versions ON COMMIT DROP AS
SELECT v.id AS version_id, v.master_id, v.mba_number, v.version_number
FROM media_plan_versions v
WHERE lower(v.mba_number) IN (SELECT mba_number FROM kr1_mbas);

CREATE TEMP TABLE kr1_masters ON COMMIT DROP AS
SELECT m.id AS master_id, m.mba_number
FROM media_plan_masters m
WHERE lower(m.mba_number) IN (SELECT mba_number FROM kr1_mbas);

-- Show what will be deleted (review in MCP output before relying on COMMIT)
SELECT 'kr1_mbas' AS set_name, count(*)::int AS n FROM kr1_mbas
UNION ALL SELECT 'kr1_clients', count(*)::int FROM kr1_clients
UNION ALL SELECT 'kr1_masters', count(*)::int FROM kr1_masters
UNION ALL SELECT 'kr1_versions', count(*)::int FROM kr1_versions;

SELECT mba_number FROM kr1_mbas ORDER BY 1;
SELECT client_id, mp_client_name, mbaidentifier FROM kr1_clients ORDER BY 1;

-- Guard: refuse empty accidental run against wrong DB
DO $$
BEGIN
  IF (SELECT count(*) FROM kr1_mbas) = 0 AND (SELECT count(*) FROM kr1_clients) = 0 THEN
    RAISE EXCEPTION 'KR-1: no krusty/krabby matches — aborting (wrong project or already clean)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Break master → published_version FK before version deletes
-- ---------------------------------------------------------------------------
UPDATE media_plan_masters m
SET published_version_id = NULL
WHERE m.id IN (SELECT master_id FROM kr1_masters);

-- ---------------------------------------------------------------------------
-- Version-scoped children (explicit deletes for ledger; cascades also exist)
-- ---------------------------------------------------------------------------
DELETE FROM billing_overrides
WHERE version_id IN (SELECT version_id FROM kr1_versions);

DELETE FROM mba_fee_snapshots
WHERE version_id IN (SELECT version_id FROM kr1_versions);

DELETE FROM schedule_months
WHERE version_id IN (SELECT version_id FROM kr1_versions);

DELETE FROM line_items
WHERE version_id IN (SELECT version_id FROM kr1_versions);

-- PC7 drafts (also ON DELETE CASCADE from masters) — table may be absent
DO $$ BEGIN
  IF to_regclass('public.plan_working_drafts') IS NOT NULL THEN
    DELETE FROM plan_working_drafts
    WHERE master_id IN (SELECT master_id FROM kr1_masters);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- MBA-keyed satellites
-- ---------------------------------------------------------------------------
DELETE FROM mba_line_approvals
WHERE lower(mba_number) IN (SELECT mba_number FROM kr1_mbas);

DELETE FROM campaign_kpi
WHERE lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM kr1_mbas)
   OR lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
   OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%';

DELETE FROM client_kpi
WHERE lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
   OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%';

DELETE FROM creative_asset
WHERE lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM kr1_mbas)
   OR media_plan_master_id IN (SELECT master_id FROM kr1_masters);

DELETE FROM planning_audiences
WHERE lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM kr1_mbas)
   OR clients_id IN (SELECT client_id FROM kr1_clients);

-- ---------------------------------------------------------------------------
-- Finance billing chain
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE kr1_billing_records ON COMMIT DROP AS
SELECT id
FROM finance_billing_records
WHERE lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM kr1_mbas)
   OR clients_id IN (SELECT client_id FROM kr1_clients)
   OR lower(coalesce(client_name, '')) LIKE '%krusty%'
   OR lower(coalesce(client_name, '')) LIKE '%krabby%';

DELETE FROM finance_edits
WHERE finance_billing_records_id IN (SELECT id FROM kr1_billing_records);

DELETE FROM finance_billing_line_items
WHERE finance_billing_records_id IN (SELECT id FROM kr1_billing_records);

DELETE FROM finance_billing_records
WHERE id IN (SELECT id FROM kr1_billing_records);

-- Forecast targets keyed by client
DELETE FROM revenue_forecast_lines
WHERE clients_id IN (SELECT client_id FROM kr1_clients);

-- ---------------------------------------------------------------------------
-- Xero: do NOT delete synced invoices; clear test MBA assignments only
-- ---------------------------------------------------------------------------
UPDATE xero_ar_invoices
SET mba_number = NULL,
    mba_match_id = NULL
WHERE lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM kr1_mbas);

DELETE FROM xero_client_aliases
WHERE client_id IN (SELECT client_id FROM kr1_clients);

DO $$ BEGIN
  IF to_regclass('public.xero_contact_links') IS NOT NULL THEN
    DELETE FROM xero_contact_links
    WHERE client_id IN (SELECT client_id FROM kr1_clients);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Codex / notes / tasks tied to test client or MBA (Postgres-native)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.tasks') IS NOT NULL THEN
    IF to_regclass('public.task_checklist_items') IS NOT NULL THEN
      DELETE FROM task_checklist_items
      WHERE task_id IN (
        SELECT id FROM tasks
        WHERE client_id IN (SELECT client_id FROM kr1_clients)
           OR lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM kr1_mbas)
      );
    END IF;
    IF to_regclass('public.task_comments') IS NOT NULL THEN
      DELETE FROM task_comments
      WHERE task_id IN (
        SELECT id FROM tasks
        WHERE client_id IN (SELECT client_id FROM kr1_clients)
           OR lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM kr1_mbas)
      );
    END IF;
    DELETE FROM tasks
    WHERE client_id IN (SELECT client_id FROM kr1_clients)
       OR lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM kr1_mbas);
  END IF;
  IF to_regclass('public.client_notes') IS NOT NULL THEN
    DELETE FROM client_notes
    WHERE client_id IN (SELECT client_id FROM kr1_clients)
       OR lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM kr1_mbas);
  END IF;
  IF to_regclass('public.client_domains') IS NOT NULL THEN
    DELETE FROM client_domains
    WHERE client_id IN (SELECT client_id FROM kr1_clients);
  END IF;
  IF to_regclass('public.ava_task_proposals') IS NOT NULL THEN
    DELETE FROM ava_task_proposals
    WHERE client_id IN (SELECT client_id FROM kr1_clients);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Versions → masters → clients
-- ---------------------------------------------------------------------------
DELETE FROM media_plan_versions
WHERE id IN (SELECT version_id FROM kr1_versions);

DELETE FROM media_plan_masters
WHERE id IN (SELECT master_id FROM kr1_masters);

-- Null any leftover masters pointing at deleted clients (non-krusty MBA edge)
UPDATE media_plan_masters
SET client_id = NULL
WHERE client_id IN (SELECT client_id FROM kr1_clients);

DELETE FROM clients
WHERE id IN (SELECT client_id FROM kr1_clients);

COMMIT;

-- After COMMIT, immediately run 05-rescan-to-zero.sql (Postgres section).
-- Expected: every count = 0.
