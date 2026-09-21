-- Migration 0085: delivery_relabels + delivery_relabel_log — delivery attribution audit
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE IF NOT EXISTS + migration_markers guard.
--
-- Do not SELECT these tables against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/deliveryRelabels.ts.
-- list/preview fail-soft 503 when missing (same as 0084 pacing_scenarios).

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0085_delivery_relabels') THEN
    RAISE NOTICE '0085 already applied — no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.delivery_relabels (
    id                   serial PRIMARY KEY,
    channel              text NOT NULL,
    platform_entity_id   text NOT NULL,
    entity_name          text,
    from_line_item_id    text,
    to_line_item_id      text NOT NULL,
    mba_number           text NOT NULL,
    date_from            date,
    date_to              date,
    reason               text NOT NULL,
    actor_email          text NOT NULL,
    status               text NOT NULL DEFAULT 'applied',
    before_state         jsonb NOT NULL,
    apply_result         jsonb,
    created_at           timestamptz NOT NULL DEFAULT now(),
    reverted_at          timestamptz,
    reverted_by_email    text,
    CONSTRAINT delivery_relabels_status_chk CHECK (status IN ('applied', 'reverted'))
  );

  CREATE INDEX IF NOT EXISTS delivery_relabels_mba_created_idx
    ON public.delivery_relabels (mba_number, created_at DESC);

  CREATE INDEX IF NOT EXISTS delivery_relabels_entity_idx
    ON public.delivery_relabels (channel, platform_entity_id, created_at DESC);

  COMMENT ON TABLE public.delivery_relabels IS
    'Delivery relabel apply/revert audit. Written by lib/pacing/relabel; Snowflake facts + LINE_ITEM_LABEL_MAP are the live write.';

  ALTER TABLE public.delivery_relabels ENABLE ROW LEVEL SECURITY;

  CREATE TABLE IF NOT EXISTS public.delivery_relabel_log (
    id           serial PRIMARY KEY,
    relabel_id   integer NOT NULL REFERENCES public.delivery_relabels(id),
    action       text NOT NULL,
    actor_email  text NOT NULL,
    payload      jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_relabel_log_action_chk CHECK (action IN ('apply', 'revert'))
  );

  CREATE INDEX IF NOT EXISTS delivery_relabel_log_relabel_idx
    ON public.delivery_relabel_log (relabel_id, created_at DESC);

  COMMENT ON TABLE public.delivery_relabel_log IS
    'Per-action payload for delivery_relabels (apply before-state; revert restore plan).';

  ALTER TABLE public.delivery_relabel_log ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0085_delivery_relabels',
    'delivery_relabels + delivery_relabel_log audit for cross-channel LINE_ITEM_ID relabel. RLS on; no ava_readonly grant.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
