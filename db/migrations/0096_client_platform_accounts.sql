-- Migration 0096: client_platform_accounts — more than one account per platform
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: CREATE TABLE IF NOT EXISTS + migration_markers guard.
--
-- Do not SELECT this table against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/clientPlatformAccounts.ts.
-- clients.idmeta stays the Meta page id. The Meta ad account is platform meta_ads.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0096_client_platform_accounts') THEN
    RAISE NOTICE '0096 already applied — no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.client_platform_accounts (
    id           bigserial PRIMARY KEY,
    client_id    bigint NOT NULL REFERENCES public.clients(id),
    platform     text NOT NULL,
    account_ref  text NOT NULL,
    label        text,
    active       boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   text,
    updated_at   timestamptz,
    CONSTRAINT client_platform_accounts_platform_chk CHECK (
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
        'snapchat'
      )
    )
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_client_platform_accounts_active_ref
    ON public.client_platform_accounts (platform, lower(account_ref))
    WHERE active;

  CREATE INDEX IF NOT EXISTS idx_client_platform_accounts_client_id
    ON public.client_platform_accounts (client_id);

  COMMENT ON TABLE public.client_platform_accounts IS
    'Platform accounts for a client. Numeric refs are digits only. CM360 and DV360 store the advertiser name. clients.idmeta stays the Meta page id.';

  ALTER TABLE public.client_platform_accounts ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0096_client_platform_accounts',
    'client_platform_accounts. RLS on, no policies, no ava_readonly grant. One active (platform, lower(account_ref)) across clients.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
