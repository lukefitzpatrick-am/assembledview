-- AUTHOR ONLY. X9.1: identity sync must never rewind.
-- Prefer GREATEST(max(id), last_value) so an ahead sequence (Xano-mirrored ids)
-- is not walked backwards. Safe / idempotent.
--
-- Replaces the rewind-prone form in 0015_clients_id_seq_sync.sql.

SELECT setval(
  'clients_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id)::bigint FROM clients), 0),
    (SELECT last_value FROM clients_id_seq)
  ),
  true
);

SELECT setval(
  'media_plan_masters_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id)::bigint FROM media_plan_masters), 0),
    (SELECT last_value FROM media_plan_masters_id_seq)
  ),
  true
);
