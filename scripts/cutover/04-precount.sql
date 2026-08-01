-- KR-1 PRE-COUNT — Postgres (Supabase slpdibnxtpdlttbbczvg)
-- Run BEFORE 03-postgres-delete-krusty.sql. Paste counts into 04-precount-ledger.md.
-- Pair with Xano STEP 0 filters from 02-xano-delete-krusty.md (same match predicates).

WITH mbas AS (
  SELECT DISTINCT lower(mba_number) AS mba_number
  FROM (
    SELECT mba_number FROM media_plan_masters
    WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%'
    UNION
    SELECT mba_number FROM media_plan_versions
    WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%'
  ) s
),
clients_m AS (
  SELECT id AS client_id
  FROM clients
  WHERE lower(coalesce(mbaidentifier, '')) IN ('krusty', 'krabby')
     OR lower(coalesce(mbaidentifier, '')) LIKE 'krusty%'
     OR lower(coalesce(mbaidentifier, '')) LIKE 'krabby%'
     OR lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
     OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%'
),
versions_m AS (
  SELECT v.id AS version_id
  FROM media_plan_versions v
  WHERE lower(v.mba_number) IN (SELECT mba_number FROM mbas)
),
billing_m AS (
  SELECT id
  FROM finance_billing_records
  WHERE lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM mbas)
     OR clients_id IN (SELECT client_id FROM clients_m)
     OR lower(coalesce(client_name, '')) LIKE '%krusty%'
     OR lower(coalesce(client_name, '')) LIKE '%krabby%'
)
SELECT * FROM (
  VALUES
    ('media_plan_masters',
      (SELECT count(*)::int FROM media_plan_masters
       WHERE lower(mba_number) IN (SELECT mba_number FROM mbas))),
    ('media_plan_versions',
      (SELECT count(*)::int FROM media_plan_versions
       WHERE id IN (SELECT version_id FROM versions_m))),
    ('line_items',
      (SELECT count(*)::int FROM line_items
       WHERE version_id IN (SELECT version_id FROM versions_m))),
    ('schedule_months',
      (SELECT count(*)::int FROM schedule_months
       WHERE version_id IN (SELECT version_id FROM versions_m))),
    ('mba_fee_snapshots',
      (SELECT count(*)::int FROM mba_fee_snapshots
       WHERE version_id IN (SELECT version_id FROM versions_m))),
    ('billing_overrides',
      (SELECT count(*)::int FROM billing_overrides
       WHERE version_id IN (SELECT version_id FROM versions_m))),
    ('mba_line_approvals',
      (SELECT count(*)::int FROM mba_line_approvals
       WHERE lower(mba_number) IN (SELECT mba_number FROM mbas))),
    ('campaign_kpi',
      (SELECT count(*)::int FROM campaign_kpi
       WHERE lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM mbas)
          OR lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
          OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%')),
    ('client_kpi',
      (SELECT count(*)::int FROM client_kpi
       WHERE lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
          OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%')),
    ('clients',
      (SELECT count(*)::int FROM clients_m)),
    ('creative_asset',
      (SELECT count(*)::int FROM creative_asset
       WHERE lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM mbas))),
    ('planning_audiences',
      (SELECT count(*)::int FROM planning_audiences
       WHERE lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM mbas)
          OR clients_id IN (SELECT client_id FROM clients_m))),
    ('finance_billing_records',
      (SELECT count(*)::int FROM billing_m)),
    ('finance_billing_line_items',
      (SELECT count(*)::int FROM finance_billing_line_items
       WHERE finance_billing_records_id IN (SELECT id FROM billing_m))),
    ('finance_edits',
      (SELECT count(*)::int FROM finance_edits
       WHERE finance_billing_records_id IN (SELECT id FROM billing_m))),
    ('revenue_forecast_lines',
      (SELECT count(*)::int FROM revenue_forecast_lines
       WHERE clients_id IN (SELECT client_id FROM clients_m))),
    ('xero_ar_invoices (mba assigned — will NULL, not delete)',
      (SELECT count(*)::int FROM xero_ar_invoices
       WHERE lower(coalesce(mba_number, '')) IN (SELECT mba_number FROM mbas))),
    ('xero_client_aliases',
      (SELECT count(*)::int FROM xero_client_aliases
       WHERE client_id IN (SELECT client_id FROM clients_m)))
) AS t(table_name, rows_to_delete)
ORDER BY table_name;

-- Distinct MBA / client lists for the ledger header (re-declare CTEs)
WITH mbas AS (
  SELECT DISTINCT lower(mba_number) AS mba_number
  FROM (
    SELECT mba_number FROM media_plan_masters
    WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%'
    UNION
    SELECT mba_number FROM media_plan_versions
    WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%'
  ) s
)
SELECT mba_number AS matched_mba FROM mbas ORDER BY 1;

SELECT c.id, c.mp_client_name, c.mbaidentifier
FROM clients c
WHERE lower(coalesce(c.mbaidentifier, '')) IN ('krusty', 'krabby')
   OR lower(coalesce(c.mbaidentifier, '')) LIKE 'krusty%'
   OR lower(coalesce(c.mbaidentifier, '')) LIKE 'krabby%'
   OR lower(coalesce(c.mp_client_name, '')) LIKE '%krusty%'
   OR lower(coalesce(c.mp_client_name, '')) LIKE '%krabby%'
ORDER BY c.id;
