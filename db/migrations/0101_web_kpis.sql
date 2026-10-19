-- Migration 0101: web_kpis and web_kpi_targets
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers guard.
--
-- Do not SELECT these tables against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/webKpis.ts.
-- A KPI is one monthly Web & search target line for a client: a sum of GA4
-- events, a GA4 metric, or a Search Console metric. Targets are per calendar
-- month. client_kpi is the media planning KPI table and is not used here.
-- No backfill. No ava_readonly grant.
--
-- RLS copied from billing_partner_packs in db/migrations/0100_billing_partner_packs.sql lines 74-75:
--   ALTER TABLE public.billing_partner_packs ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.billing_partner_pack_items ENABLE ROW LEVEL SECURITY;
-- No policies. Server only.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0101_web_kpis') THEN
    RAISE NOTICE '0101 already applied — no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.web_kpis (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id    bigint NOT NULL,
    label        text NOT NULL,
    source       text NOT NULL,
    event_names  text[],
    metric       text,
    active       boolean NOT NULL DEFAULT true,
    sort_order   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   text NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   text,
    CONSTRAINT web_kpis_source_check CHECK (source IN ('ga4_event', 'ga4_metric', 'gsc_metric')),
    CONSTRAINT web_kpis_metric_check CHECK (
      metric IS NULL
      OR metric IN ('sessions', 'engaged_sessions', 'key_events', 'page_views', 'clicks', 'impressions')
    ),
    CONSTRAINT web_kpis_source_fields_check CHECK (
      (source = 'ga4_event'
        AND event_names IS NOT NULL
        AND cardinality(event_names) >= 1
        AND metric IS NULL)
      OR (source = 'ga4_metric'
        AND metric IN ('sessions', 'engaged_sessions', 'key_events', 'page_views')
        AND event_names IS NULL)
      OR (source = 'gsc_metric'
        AND metric IN ('clicks', 'impressions')
        AND event_names IS NULL)
    ),
    CONSTRAINT web_kpis_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients (id)
  );

  CREATE INDEX IF NOT EXISTS idx_web_kpis_client_id_active
    ON public.web_kpis (client_id, active);

  COMMENT ON TABLE public.web_kpis IS
    'Web & search KPI for a client. ga4_event sums event_names; ga4_metric and gsc_metric read one metric.';

  CREATE TABLE IF NOT EXISTS public.web_kpi_targets (
    kpi_id      uuid NOT NULL,
    month       date NOT NULL,
    target      numeric(14, 2) NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  text,
    CONSTRAINT web_kpi_targets_pkey PRIMARY KEY (kpi_id, month),
    CONSTRAINT web_kpi_targets_month_check CHECK (EXTRACT(DAY FROM month) = 1),
    CONSTRAINT web_kpi_targets_target_check CHECK (target >= 0),
    CONSTRAINT web_kpi_targets_kpi_id_fkey
      FOREIGN KEY (kpi_id) REFERENCES public.web_kpis (id) ON DELETE CASCADE
  );

  COMMENT ON TABLE public.web_kpi_targets IS
    'Monthly target for a web_kpis row. month is the first of the month.';

  ALTER TABLE public.web_kpis ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.web_kpi_targets ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0101_web_kpis',
    'web_kpis and web_kpi_targets. RLS on, no policies. No backfill. No ava_readonly grant.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
