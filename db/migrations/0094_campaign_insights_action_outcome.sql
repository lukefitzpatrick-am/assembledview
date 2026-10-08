-- Migration 0094: campaign_insights action, owner and outcome (AUTHOR ONLY — do not apply)
--
-- insight_type stays the category (delivery / audience / creative / channel / commercial).
-- action, action_owner, outcome and outcome_kind are nullable so existing rows stay valid.
-- outcome_kind is null, or achieved, or expected.
-- No backfill. Do not drizzle-kit. Apply before any deploy that selects these columns.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

ALTER TABLE public.campaign_insights
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS action_owner text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_kind text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'campaign_insights_outcome_kind_check'
      AND conrelid = 'public.campaign_insights'::regclass
  ) THEN
    ALTER TABLE public.campaign_insights
      ADD CONSTRAINT campaign_insights_outcome_kind_check
      CHECK (outcome_kind IS NULL OR outcome_kind IN ('achieved', 'expected'));
  END IF;
END $$;

COMMENT ON COLUMN public.campaign_insights.action IS
  'Next step for this insight. Null on rows written before 0094.';
COMMENT ON COLUMN public.campaign_insights.action_owner IS
  'Who owns the action: Assembled, the client, or the publisher by name.';
COMMENT ON COLUMN public.campaign_insights.outcome IS
  'Effect of the insight: a number, or what will be measured and when.';
COMMENT ON COLUMN public.campaign_insights.outcome_kind IS
  'achieved for work already done, expected for a recommendation. Null when outcome is unset.';

INSERT INTO public.migration_markers (key, note)
VALUES (
  '0094_campaign_insights_action_outcome',
  'campaign_insights.action, action_owner, outcome, outcome_kind (achieved|expected). Nullable. insight_type unchanged.'
)
ON CONFLICT (key) DO NOTHING;
