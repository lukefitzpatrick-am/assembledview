-- Migration 0100: billing_partner_packs and billing_partner_pack_items
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
-- Idempotent: migration_markers guard.
--
-- Do not SELECT these tables against live Postgres until this file is applied (C-76).
-- Mirror: db/schema/billingPartnerPacks.ts.
-- A pack is one Advertising Associates send for a billing month.
-- Items are the published versions in that send.
-- No backfill. No ava_readonly grant.
--
-- RLS copied from report_runs in db/migrations/0095_report_runs.sql lines 64-65:
--   ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.report_digest_sends ENABLE ROW LEVEL SECURITY;
-- No policies. Server only.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.migration_markers WHERE key = '0100_billing_partner_packs') THEN
    RAISE NOTICE '0100 already applied — no-op';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.billing_partner_packs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_month   date NOT NULL,
    status          text NOT NULL DEFAULT 'draft',
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      text NOT NULL,
    sent_at         timestamptz,
    sent_by         text,
    blob_pathname   text,
    note            text,
    CONSTRAINT billing_partner_packs_status_check CHECK (status IN ('draft', 'sent'))
  );

  CREATE INDEX IF NOT EXISTS idx_billing_partner_packs_billing_month_status
    ON public.billing_partner_packs (billing_month, status);

  COMMENT ON TABLE public.billing_partner_packs IS
    'One Advertising Associates send for a billing month. status is draft or sent.';

  CREATE TABLE IF NOT EXISTS public.billing_partner_pack_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pack_id         uuid NOT NULL,
    mba_number      text NOT NULL,
    version_id      bigint NOT NULL,
    version_number  integer NOT NULL,
    change_kind     text NOT NULL,
    months_changed  jsonb,
    back_dated      boolean NOT NULL DEFAULT false,
    CONSTRAINT billing_partner_pack_items_change_kind_check CHECK (change_kind IN ('new', 'amended')),
    CONSTRAINT billing_partner_pack_items_pack_id_version_id_key UNIQUE (pack_id, version_id),
    CONSTRAINT billing_partner_pack_items_pack_id_fkey
      FOREIGN KEY (pack_id) REFERENCES public.billing_partner_packs (id) ON DELETE CASCADE,
    CONSTRAINT billing_partner_pack_items_version_id_fkey
      FOREIGN KEY (version_id) REFERENCES public.media_plan_versions (id)
  );

  CREATE INDEX IF NOT EXISTS idx_billing_partner_pack_items_mba_number
    ON public.billing_partner_pack_items (mba_number);

  CREATE INDEX IF NOT EXISTS idx_billing_partner_pack_items_version_id
    ON public.billing_partner_pack_items (version_id);

  COMMENT ON TABLE public.billing_partner_pack_items IS
    'Published versions included in an Advertising Associates pack. months_changed is null when schedule_months is missing on either side of the last sent version.';

  ALTER TABLE public.billing_partner_packs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.billing_partner_pack_items ENABLE ROW LEVEL SECURITY;

  INSERT INTO public.migration_markers (key, note)
  VALUES (
    '0100_billing_partner_packs',
    'billing_partner_packs and billing_partner_pack_items. RLS on, no policies. No backfill. No ava_readonly grant.'
  )
  ON CONFLICT (key) DO NOTHING;
END
$$;
