-- KR-1 STEP 0 — DISCOVERY (Postgres / Supabase project slpdibnxtpdlttbbczvg)
-- Run FIRST. Review every returned mba_number / client before any DELETE.
-- Acceptance for wildcards: the LIKE patterns below must be justified by this
-- result set (no blind deletes).

-- A) Exact MBA inventory (masters)
SELECT
  id AS master_id,
  mba_number,
  mp_client_name,
  client_id,
  campaign_status,
  published_version_id,
  version_number_hint.version_count
FROM media_plan_masters m
LEFT JOIN LATERAL (
  SELECT count(*)::int AS version_count
  FROM media_plan_versions v
  WHERE v.master_id = m.id
) version_number_hint ON true
WHERE lower(m.mba_number) LIKE 'krusty%'
   OR lower(m.mba_number) LIKE 'krabby%'
ORDER BY m.mba_number;

-- B) Version inventory
SELECT
  v.id AS version_id,
  v.master_id,
  v.mba_number,
  v.version_number,
  v.campaign_status,
  v.campaign_name
FROM media_plan_versions v
WHERE lower(v.mba_number) LIKE 'krusty%'
   OR lower(v.mba_number) LIKE 'krabby%'
ORDER BY v.mba_number, v.version_number;

-- C) Client inventory (identifier + name)
SELECT
  id AS client_id,
  mp_client_name,
  mbaidentifier,
  legalbusinessname
FROM clients
WHERE lower(coalesce(mbaidentifier, '')) IN ('krusty', 'krabby')
   OR lower(coalesce(mbaidentifier, '')) LIKE 'krusty%'
   OR lower(coalesce(mbaidentifier, '')) LIKE 'krabby%'
   OR lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
   OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%'
ORDER BY id;

-- D) Orphan / satellite MBA strings (no master row required)
SELECT 'campaign_kpi' AS src, id, mba_number, mp_client_name
FROM campaign_kpi
WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
   OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
   OR lower(coalesce(mp_client_name, '')) LIKE '%krusty%'
   OR lower(coalesce(mp_client_name, '')) LIKE '%krabby%'
UNION ALL
SELECT 'mba_line_approvals', id, mba_number, NULL
FROM mba_line_approvals
WHERE lower(mba_number) LIKE 'krusty%'
   OR lower(mba_number) LIKE 'krabby%'
UNION ALL
SELECT 'finance_billing_records', id, mba_number, client_name
FROM finance_billing_records
WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
   OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
   OR lower(coalesce(client_name, '')) LIKE '%krusty%'
   OR lower(coalesce(client_name, '')) LIKE '%krabby%'
UNION ALL
SELECT 'creative_asset', id, mba_number, NULL
FROM creative_asset
WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
   OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
UNION ALL
SELECT 'planning_audiences', id, mba_number, NULL
FROM planning_audiences
WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
   OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
UNION ALL
SELECT 'xero_ar_invoices', id, mba_number, NULL
FROM xero_ar_invoices
WHERE lower(coalesce(mba_number, '')) LIKE 'krusty%'
   OR lower(coalesce(mba_number, '')) LIKE 'krabby%'
ORDER BY 1, 3, 2;
