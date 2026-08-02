-- AUTHOR ONLY. X7: golf022 has NULL media_plan_masters.published_version_id
-- (pointer audit null_published). Claude applies via MCP after reviewing SELECT.
--
-- Author probe (2026-08-02, localhost PG): master id=191, campaign_status=completed,
-- published_version_id NULL, and ZERO rows in media_plan_versions for this master.
-- There is no tip id to set until a version row exists (migrate/create first).
-- media_plan_versions has created_at only (no updated_at) — aliased as updated below.

-- (1) Master pointer + versions (id, version_number, status, updated)
SELECT
  m.id AS master_id,
  m.mba_number,
  m.campaign_status AS master_campaign_status,
  m.published_version_id,
  v.id AS version_id,
  v.version_number,
  v.campaign_status AS status,
  v.created_at AS updated
FROM media_plan_masters m
LEFT JOIN media_plan_versions v ON v.master_id = m.id
WHERE m.mba_number = 'golf022'
ORDER BY v.version_number DESC NULLS LAST, v.id DESC NULLS LAST;

-- (2) Apply (uncomment only after SELECT shows a real tip version_id).
-- Prefer the published tip you intend (usually latest booked/approved/completed).
-- Do NOT blindly use max(version_number) if a lower booked tip should stay live.
--
-- Example once a tip exists (replace <VERSION_ID>):
-- UPDATE media_plan_masters
-- SET published_version_id = <VERSION_ID>
-- WHERE id = 191
--   AND mba_number = 'golf022'
--   AND published_version_id IS NULL;
