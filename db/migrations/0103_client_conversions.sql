-- Migration 0103: client_conversion_settings and client_conversion_events
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers guard.
--
-- Do not SELECT these tables against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/clientConversions.ts.
-- Plan: PLAN-AV-conversions-roas-2026-10-21 section 4.2. Decisions (Luke, 21 Oct 2026):
--   1. One switch per client (no per-MBA override).
--   2. Visible to everyone (clients and staff) when the switch is on.
--   3. One headline per client: purchases, leads or conversions.
--   9. ava_readonly gets SELECT (0003 style allowlist: GRANT + ava_read policy).
--  10. No CPA or ROAS targets yet.
-- Switch off: the read route returns nothing and no conversion tile renders.
-- Switch on with no events for a platform: that channel shows "Not tracked on this campaign".
--
-- RLS copied from web_kpis in db/migrations/0101_web_kpis.sql:
--   ALTER TABLE public.web_kpis ENABLE ROW LEVEL SECURITY;
-- No policies for app roles. Server only (service connection).
-- ava_readonly copied from db/migrations/0007_mba_line_approvals.sql section 2.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0103_client_conversions') THEN
    RAISE NOTICE '0103 already applied — no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.client_conversion_settings (
    client_id     bigint PRIMARY KEY REFERENCES public.clients (id),
    enabled       boolean NOT NULL DEFAULT false,
    headline      text NOT NULL DEFAULT 'conversions',
    show_revenue  boolean NOT NULL DEFAULT false,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    text,
    CONSTRAINT client_conversion_settings_headline_check
      CHECK (headline IN ('purchases', 'leads', 'conversions'))
  );

  COMMENT ON TABLE public.client_conversion_settings IS
    'Per client conversions switch. enabled shows conversion tiles to everyone; headline names the main tile; show_revenue adds Revenue and ROAS.';

  CREATE TABLE IF NOT EXISTS public.client_conversion_events (
    id             bigserial PRIMARY KEY,
    client_id      bigint NOT NULL REFERENCES public.clients (id),
    platform       text NOT NULL,
    event_key      text NOT NULL,
    label          text,
    category       text NOT NULL,
    include_value  boolean NOT NULL DEFAULT false,
    active         boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     text,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     text,
    CONSTRAINT client_conversion_events_platform_check CHECK (
      platform IN ('meta_ads', 'google_ads', 'tiktok', 'dv360', 'cm360', 'taboola', 'reddit')
    ),
    CONSTRAINT client_conversion_events_category_check CHECK (
      category IN ('purchase', 'lead', 'other')
    ),
    CONSTRAINT client_conversion_events_client_platform_key UNIQUE (client_id, platform, event_key)
  );

  CREATE INDEX IF NOT EXISTS idx_client_conversion_events_client_active
    ON public.client_conversion_events (client_id, active);

  COMMENT ON TABLE public.client_conversion_events IS
    'Events that count as conversions for a client, per platform. event_key matches MART.CONVERSION_FACT.EVENT_KEY. include_value counts toward revenue.';

  ALTER TABLE public.client_conversion_settings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.client_conversion_events ENABLE ROW LEVEL SECURITY;

  -- ava_readonly allowlist extension (0003 style), decision 9.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ava_readonly') THEN
    GRANT SELECT ON TABLE public.client_conversion_settings TO ava_readonly;
    GRANT SELECT ON TABLE public.client_conversion_events TO ava_readonly;
    DROP POLICY IF EXISTS ava_read ON public.client_conversion_settings;
    CREATE POLICY ava_read ON public.client_conversion_settings
      FOR SELECT TO ava_readonly USING (true);
    DROP POLICY IF EXISTS ava_read ON public.client_conversion_events;
    CREATE POLICY ava_read ON public.client_conversion_events
      FOR SELECT TO ava_readonly USING (true);
  END IF;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0103_client_conversions',
    'client_conversion_settings and client_conversion_events. RLS on, ava_readonly SELECT only. No backfill.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;

-- After (read only): expect two rows, both relrowsecurity = true, and two ava_read policies.
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('client_conversion_settings','client_conversion_events');
-- SELECT tablename, policyname, roles FROM pg_policies WHERE tablename LIKE 'client_conversion_%';
