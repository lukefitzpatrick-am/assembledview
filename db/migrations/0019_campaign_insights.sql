-- Migration 0019: campaign_insights
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Already applied by hand on live (read 11 Aug). Repo mirror for fresh rebuilds.
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS → no-op against current DB.
--
-- CHECK constraints live in SQL; drizzle mirror is db/schema/insights.ts.
-- mba_number is lowercase by constraint — do not fight it in app code.
-- No FK to clients (same DI-12 / ETL collision posture as Codex client_id columns).
-- RLS is OFF on live — do not enable here.

CREATE TABLE IF NOT EXISTS public.campaign_insights (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mba_number text NOT NULL,
  client_id bigint NOT NULL,
  period text,
  insight_type text NOT NULL,
  body text NOT NULL,
  source text NOT NULL,
  confidence text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  superseded_by bigint REFERENCES public.campaign_insights(id),
  superseded_at timestamptz,
  CONSTRAINT campaign_insights_insight_type_check
    CHECK (insight_type = ANY (ARRAY['delivery'::text, 'audience'::text, 'creative'::text, 'channel'::text, 'commercial'::text])),
  CONSTRAINT campaign_insights_source_check
    CHECK (source = ANY (ARRAY['ava'::text, 'human'::text])),
  CONSTRAINT campaign_insights_mba_number_lowercase
    CHECK (mba_number = lower(mba_number)),
  CONSTRAINT campaign_insights_supersede_pair
    CHECK ((superseded_by IS NULL) = (superseded_at IS NULL)),
  CONSTRAINT campaign_insights_no_self_supersede
    CHECK ((superseded_by IS NULL) OR (superseded_by <> id))
);

CREATE INDEX IF NOT EXISTS idx_campaign_insights_client_created
  ON public.campaign_insights (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_insights_mba
  ON public.campaign_insights (mba_number);

CREATE INDEX IF NOT EXISTS idx_campaign_insights_live
  ON public.campaign_insights (client_id, created_at DESC)
  WHERE (superseded_by IS NULL);

CREATE INDEX IF NOT EXISTS idx_campaign_insights_body_fts
  ON public.campaign_insights
  USING gin (to_tsvector('english'::regconfig, body));
