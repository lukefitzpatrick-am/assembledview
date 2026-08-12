-- Migration 0021: m365_provisioning_log (M5 Graph provisioning audit)
-- Apply via Supabase SQL Editor / MCP after review — AUTHOR ONLY (Luke).
-- Do NOT drizzle-kit migrate from Cursor. Idempotent.
--
-- One row per Graph wrapper attempt (success or failure), including retries.
-- No FK to clients — entity_id is opaque text (client id, site id, team id, …).

CREATE TABLE IF NOT EXISTS m365_provisioning_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text,
  action text NOT NULL,
  request_id text,
  actor text,
  outcome text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT m365_provisioning_log_outcome_check
    CHECK (outcome = ANY (ARRAY['success'::text, 'failure'::text, 'skipped'::text]))
);

CREATE INDEX IF NOT EXISTS idx_m365_provisioning_log_created
  ON m365_provisioning_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_m365_provisioning_log_entity
  ON m365_provisioning_log (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_m365_provisioning_log_request
  ON m365_provisioning_log (request_id)
  WHERE request_id IS NOT NULL;

-- ava_readonly: SELECT allowlist (0003 style)
GRANT SELECT ON TABLE m365_provisioning_log TO ava_readonly;
ALTER TABLE m365_provisioning_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ava_read ON m365_provisioning_log;
CREATE POLICY ava_read ON m365_provisioning_log
  FOR SELECT TO ava_readonly USING (true);
