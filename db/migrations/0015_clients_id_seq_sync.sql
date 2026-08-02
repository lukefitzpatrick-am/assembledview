-- AUTHOR ONLY (Luke/Claude apply). X1: clients.id identity can lag after ETL
-- explicit-id loads — next DEFAULT would collide with max(id). Sync sequence
-- to current max. Safe / idempotent.
--
-- Live check (2026-08-02): max(id)=53, clients_id_seq.last_value=52 → next=53 boom.

SELECT setval(
  pg_get_serial_sequence('clients', 'id'),
  COALESCE((SELECT MAX(id) FROM clients), 1),
  true
);
