-- Migration 0026: close rls_disabled_in_public (Supabase security advisory, 09 Aug 2026)
-- APPLIED to slpdibnxtpdlttbbczvg on 12 Aug 2026 via Supabase MCP (Claude). Idempotent.
--
-- Why this is safe: the app connects as the table owner (postgres), which RLS does
-- not constrain — the 13 codex/drafts tables have run RLS-enabled with no policies
-- since 0013 with zero app impact. What this closes is PostgREST anon/authenticated
-- access via the project URL (the advisory's "anyone can read, edit, delete").
--
-- ava_readonly is a plain role (no BYPASSRLS): it keeps campaign_insights SELECT
-- via an explicit policy, matching the 0022 GRANT. No other non-owner role reads
-- these four tables.

ALTER TABLE public.migration_markers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_insights   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_item_panels    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publisher_profiles  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_insights_ava_readonly_select ON public.campaign_insights;
CREATE POLICY campaign_insights_ava_readonly_select
  ON public.campaign_insights
  FOR SELECT
  TO ava_readonly
  USING (true);

-- VERIFICATION (run any time):
-- select relname, relrowsecurity from pg_class
--  where relname in ('migration_markers','campaign_insights','line_item_panels','publisher_profiles');
-- select polname from pg_policies where tablename = 'campaign_insights';
-- Supabase advisor: rls_disabled_in_public count must be 0.
