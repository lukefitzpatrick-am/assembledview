-- Codex campaign seed: allow tasks.source = 'profile:<name>' (idempotent seed key).
-- Replaces tasks_source_check from 0013_codex_v2.sql.

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_source_check
  CHECK (
    source = ANY (ARRAY['manual'::text, 'ava'::text, 'template'::text, 'recurring'::text])
    OR source LIKE 'profile:%'
  );
