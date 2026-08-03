-- AUTHOR ONLY. X7: golf022 NULL published_version_id — CLOSED (do not apply UPDATE).
--
-- Verdict (2026-08-02): zero versions in both stores (PG + Xano). NULL tip is
-- correct. Master id=191, campaign_status=completed. a07d1224 UPDATE unapplied.
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
