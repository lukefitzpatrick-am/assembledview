-- KR-1 RESCAN-TO-ZERO — Postgres (Supabase slpdibnxtpdlttbbczvg)
-- Acceptance: every count below MUST be 0 (C-20 lesson: rescan the pattern).
-- Run after 03-postgres-delete-krusty.sql COMMITs.
-- Pair with Xano checklist in 05-rescan-to-zero.md.

SELECT * FROM (
  VALUES
    ('media_plan_masters',
      (SELECT count(*)::int FROM media_plan_masters
       WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%')),
    ('media_plan_versions',
      (SELECT count(*)::int FROM media_plan_versions
       WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%')),
    ('line_items (via version mba)',
      (SELECT count(*)::int FROM line_items li
       JOIN media_plan_versions v ON v.id = li.version_id
       WHERE lower(v.mba_number) LIKE 'krusty%' OR lower(v.mba_number) LIKE 'krabby%')),
    ('schedule_months (via version mba)',
      (SELECT count(*)::int FROM schedule_months sm
       JOIN media_plan_versions v ON v.id = sm.version_id
       WHERE lower(v.mba_number) LIKE 'krusty%' OR lower(v.mba_number) LIKE 'krabby%')),
    ('mba_fee_snapshots (via version mba)',
      (SELECT count(*)::int FROM mba_fee_snapshots fs
       JOIN media_plan_versions v ON v.id = fs.version_id
       WHERE lower(v.mba_number) LIKE 'krusty%' OR lower(v.mba_number) LIKE 'krabby%')),
    ('billing_overrides (via version mba)',
      (SELECT count(*)::int FROM billing_overrides bo
       JOIN media_plan_versions v ON v.id = bo.version_id
       WHERE lower(v.mba_number) LIKE 'krusty%' OR lower(v.mba_number) LIKE 'krabby%')),
    ('mba_line_approvals',
      (SELECT count(*)::int FROM mba_line_approvals
       WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%')),
    ('campaign_kpi',
      (SELECT count(*)::int FROM campaign_kpi
       WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
          OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
          OR lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
          OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%')),
    ('client_kpi',
      (SELECT count(*)::int FROM client_kpi
       WHERE lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
          OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%')),
    ('clients',
      (SELECT count(*)::int FROM clients
       WHERE lower(coalesce(mbaidentifier, '')) IN ('krusty', 'krabby')
          OR lower(coalesce(mbaidentifier, '')) LIKE 'krusty%'
          OR lower(coalesce(mbaidentifier, '')) LIKE 'krabby%'
          OR lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
          OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%')),
    ('creative_asset',
      (SELECT count(*)::int FROM creative_asset
       WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
          OR lower(coalesce(mba_number, '')) LIKE 'krabby%')),
    ('planning_audiences',
      (SELECT count(*)::int FROM planning_audiences
       WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
          OR lower(coalesce(mba_number, '')) LIKE 'krabby%')),
    ('finance_billing_records',
      (SELECT count(*)::int FROM finance_billing_records
       WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
          OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
          OR lower(coalesce(client_name, '')) LIKE '%krusty%'
          OR lower(coalesce(client_name, '')) LIKE '%krabby%')),
    ('revenue_forecast_lines (via krusty/krabby clients)',
      (SELECT count(*)::int FROM revenue_forecast_lines rfl
       JOIN clients c ON c.id = rfl.clients_id
       WHERE lower(coalesce(c.mbaidentifier, '')) IN ('krusty', 'krabby')
          OR lower(coalesce(c.mbaidentifier, '')) LIKE 'krusty%'
          OR lower(coalesce(c.mbaidentifier, '')) LIKE 'krabby%'
          OR lower(coalesce(c.mp_client_name, '')) LIKE '%krusty%'
          OR lower(coalesce(c.mp_client_name, '')) LIKE '%krabby%')),
    ('xero_ar_invoices.mba_number still assigned',
      (SELECT count(*)::int FROM xero_ar_invoices
       WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
          OR lower(coalesce(mba_number, '')) LIKE 'krabby%')),
    ('xero_client_aliases (via krusty/krabby clients)',
      (SELECT count(*)::int FROM xero_client_aliases xca
       JOIN clients c ON c.id = xca.client_id
       WHERE lower(coalesce(c.mbaidentifier, '')) IN ('krusty', 'krabby')
          OR lower(coalesce(c.mp_client_name, '')) LIKE '%krusty%'
          OR lower(coalesce(c.mp_client_name, '')) LIKE '%krabby%')),
    ('line_item_id prefix orphans (any version)',
      (SELECT count(*)::int FROM line_items
       WHERE lower(line_item_id) LIKE 'krusty%'
          OR lower(line_item_id) LIKE 'krabby%'))
) AS t(table_name, remaining_rows)
ORDER BY table_name;

-- Compact acceptance signal (must be 0)
SELECT
  (SELECT count(*)::int FROM media_plan_masters
   WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%')
  + (SELECT count(*)::int FROM media_plan_versions
     WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%')
  + (SELECT count(*)::int FROM clients
     WHERE lower(coalesce(mbaidentifier, '')) IN ('krusty', 'krabby')
        OR lower(coalesce(mbaidentifier, '')) LIKE 'krusty%'
        OR lower(coalesce(mbaidentifier, '')) LIKE 'krabby%'
        OR lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
        OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%')
  + (SELECT count(*)::int FROM mba_line_approvals
     WHERE lower(mba_number) LIKE 'krusty%' OR lower(mba_number) LIKE 'krabby%')
  + (SELECT count(*)::int FROM campaign_kpi
     WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
        OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
        OR lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
        OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%')
  + (SELECT count(*)::int FROM finance_billing_records
     WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
        OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
        OR lower(coalesce(client_name, '')) LIKE '%krusty%'
        OR lower(coalesce(client_name, '')) LIKE '%krabby%')
  + (SELECT count(*)::int FROM line_items
     WHERE lower(line_item_id) LIKE 'krusty%' OR lower(line_item_id) LIKE 'krabby%')
  AS total_remaining_must_be_zero;
