-- 0005_finance_billing_amount_hash.sql
-- Port Xano finance_billing_records.billed_amount + billed_lines_hash as real columns.
-- Money stored as integer cents (kickoff contract). Apply via Supabase SQL Editor / MCP.
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE finance_billing_records ADD COLUMN IF NOT EXISTS billed_amount_cents bigint;
ALTER TABLE finance_billing_records ADD COLUMN IF NOT EXISTS billed_lines_hash text;
