-- Migration 0098: GA4 and Search Console accounts, creative preview cache, web reports
-- AUTHOR ONLY. NOT APPLIED. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers guard. Requires 0096 (client_platform_accounts exists).
--
-- Do not SELECT creative_preview_cache, client_web_reports, or
-- client_web_report_versions until this file is applied (C-76).
-- Do not rely on platform values ga4 or gsc until this file is applied.
-- RLS on, no policies, no ava_readonly grant. No backfill.
-- Mirrors: db/schema/clientPlatformAccounts.ts, db/schema/creativePreviewCache.ts,
-- db/schema/clientWebReports.ts.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.migration_markers
    WHERE key = '0098_ga4_gsc_accounts_and_creative_previews'
  ) THEN
    RAISE NOTICE '0098 already applied — no-op';
    RETURN;
  END IF;

  ALTER TABLE public.client_platform_accounts
    DROP CONSTRAINT IF EXISTS client_platform_accounts_platform_chk;

  ALTER TABLE public.client_platform_accounts
    ADD CONSTRAINT client_platform_accounts_platform_chk CHECK (
      platform IN (
        'meta_ads',
        'google_ads',
        'cm360',
        'dv360',
        'tiktok',
        'reddit',
        'taboola',
        'vistar',
        'channel_factory',
        'linkedin',
        'pinterest',
        'snapchat',
        'ga4',
        'gsc'
      )
    );

  CREATE TABLE IF NOT EXISTS public.creative_preview_cache (
    id             bigserial PRIMARY KEY,
    platform       text NOT NULL,
    creative_key   text NOT NULL,
    client_id      bigint REFERENCES public.clients(id),
    blob_pathname  text,
    mime_type      text,
    width          integer,
    height         integer,
    source         text NOT NULL,
    source_ref     text,
    fetched_at     timestamptz,
    expires_at     timestamptz,
    error          text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz,
    CONSTRAINT creative_preview_cache_platform_chk CHECK (
      platform IN ('meta', 'tiktok', 'cm360')
    ),
    CONSTRAINT creative_preview_cache_source_chk CHECK (
      source IN ('platform', 'av_library', 'none')
    ),
    CONSTRAINT creative_preview_cache_platform_key_uq UNIQUE (platform, creative_key)
  );

  COMMENT ON TABLE public.creative_preview_cache IS
    'Cached creative preview. creative_key is a Meta ad id, a TikTok ad id, or a normalised CM360 creative name. Requires 0098 applied.';

  ALTER TABLE public.creative_preview_cache ENABLE ROW LEVEL SECURITY;

  CREATE TABLE IF NOT EXISTS public.client_web_reports (
    id                 bigserial PRIMARY KEY,
    client_id          bigint NOT NULL REFERENCES public.clients(id),
    status             text NOT NULL DEFAULT 'draft',
    current_version    integer NOT NULL DEFAULT 0,
    ga4_property_ref   text,
    gsc_site_ref       text,
    brand_terms        text[] NOT NULL DEFAULT '{}',
    default_period     text NOT NULL DEFAULT 'last_month',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz,
    updated_by         text,
    CONSTRAINT client_web_reports_status_chk CHECK (
      status IN ('draft', 'published')
    ),
    CONSTRAINT client_web_reports_default_period_chk CHECK (
      default_period IN ('last_month', 'last_28_days', 'month_to_date_yoy')
    ),
    CONSTRAINT client_web_reports_client_id_uq UNIQUE (client_id)
  );

  COMMENT ON TABLE public.client_web_reports IS
    'One web and search report per client. Requires 0098 applied.';

  ALTER TABLE public.client_web_reports ENABLE ROW LEVEL SECURITY;

  CREATE TABLE IF NOT EXISTS public.client_web_report_versions (
    id         bigserial PRIMARY KEY,
    report_id  bigint NOT NULL REFERENCES public.client_web_reports(id),
    version    integer NOT NULL,
    layout     jsonb NOT NULL,
    saved_by   text,
    saved_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT client_web_report_versions_report_version_uq UNIQUE (report_id, version)
  );

  COMMENT ON TABLE public.client_web_report_versions IS
    'Ordered layout versions for a client web report. layout is an array of { elementId, settings }. Requires 0098 applied.';

  ALTER TABLE public.client_web_report_versions ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0098_ga4_gsc_accounts_and_creative_previews',
    'client_platform_accounts allows ga4 and gsc. creative_preview_cache, client_web_reports, client_web_report_versions. RLS on, no policies, no ava_readonly grant. NOT APPLIED until this marker exists.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
