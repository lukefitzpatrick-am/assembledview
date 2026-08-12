-- Migration 0022: grant campaign_insights SELECT to ava_readonly
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- RLS stays OFF on campaign_insights (0019) — GRANT alone opens AVA reads.
-- Idempotent.

GRANT SELECT ON TABLE public.campaign_insights TO ava_readonly;
