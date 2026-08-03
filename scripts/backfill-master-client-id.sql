-- AUTHOR ONLY. X1: backfill media_plan_masters.client_id from clients
-- when NULL, matching on lower(trim(mp_client_name)).
-- Dry-run first (SELECT), then UPDATE.

-- Preview
SELECT
  m.id AS master_id,
  m.mba_number,
  m.mp_client_name,
  m.client_id AS current_client_id,
  c.id AS resolved_client_id
FROM media_plan_masters m
LEFT JOIN clients c
  ON lower(trim(c.mp_client_name)) = lower(trim(m.mp_client_name))
WHERE m.client_id IS NULL
  AND m.mp_client_name IS NOT NULL
  AND trim(m.mp_client_name) <> '';

-- Apply (uncomment to run)
-- UPDATE media_plan_masters m
-- SET client_id = c.id
-- FROM clients c
-- WHERE m.client_id IS NULL
--   AND m.mp_client_name IS NOT NULL
--   AND trim(m.mp_client_name) <> ''
--   AND lower(trim(c.mp_client_name)) = lower(trim(m.mp_client_name));
