-- Migration 0044: mi_resolution jsonb on media_plan_versions
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- 0043 reserved for CX2-9 (meeting_attribution_targets). Do not mint 0043 for specs/SD-2.
-- Persist MI interview answers only ({ answers, updatedAt, updatedBy }) — never a full
-- MiResolveResult. Owner path; no ava_readonly grant (same as publisher_specs / spec_runs).

ALTER TABLE public.media_plan_versions
  ADD COLUMN IF NOT EXISTS mi_resolution jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.media_plan_versions.mi_resolution IS
  'Persisted MI interview answers for this version. Shape: { answers, updatedAt, updatedBy }. Never store full MiResolveResult.';
