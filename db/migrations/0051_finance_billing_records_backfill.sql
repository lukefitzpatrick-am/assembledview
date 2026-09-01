-- Migration 0051: backfill app-written finance_billing_records from Xano
-- AUTHOR ONLY. Apply via Supabase SQL Editor. Do not drizzle-kit migrate.
--
-- Live probe 1 Sep 2026 (Xano GET /finance_billing_records, complete dump of 444
-- rows, min id 67 / max id 510; Metadata API 401 so itemsTotal unverified):
--   xero: 443 · media: 1 · sow: 0 · retainer: 0
-- Postgres at the same moment: xero: 479 · media: 1 (same invoice_key).
-- The only app-written Xano row is already in Postgres. Staging still lists it
-- so the INSERT path is real; NOT EXISTS makes the apply a no-op. Re-probe
-- Xano and add VALUES here if new media:/sow:/retainer: keys appear before apply.
--
-- Never UPDATE existing rows. Never insert invoice_key LIKE 'xero:%'.

CREATE TABLE IF NOT EXISTS public.migration_markers (
  key         text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

CREATE TEMP TABLE _t01_xano_app_billing (
  invoice_key text PRIMARY KEY,
  clients_id bigint,
  client_name text,
  billing_type text,
  mba_number text,
  campaign_name text,
  po_number text,
  billing_month text,
  invoice_date date,
  payment_days bigint,
  payment_terms text,
  status text,
  total numeric,
  has_pending_edits boolean,
  source_billing_schedule_id bigint,
  billed boolean,
  billed_at timestamptz,
  billed_by bigint,
  notes text,
  billed_amount_cents bigint,
  billed_lines_hash text,
  created_at timestamptz
);

INSERT INTO _t01_xano_app_billing (
  invoice_key, clients_id, client_name, billing_type, mba_number, campaign_name,
  po_number, billing_month, invoice_date, payment_days, payment_terms, status,
  total, has_pending_edits, source_billing_schedule_id, billed, billed_at,
  billed_by, notes, billed_amount_cents, billed_lines_hash, created_at
) VALUES (
  'media:BICAU003:2026-06',
  17,
  'BIC',
  'media',
  'BICAU003',
  'Social Boosting',
  '',
  '2026-06',
  NULL,
  30,
  'Net 30 days',
  'draft',
  2916.67,
  false,
  0,
  true,
  to_timestamp(1780622217476 / 1000.0),
  0,
  '',
  0,
  '',
  to_timestamp(1780622217886 / 1000.0)
);

DO $$
DECLARE
  incoming int;
  xero_n int;
  to_insert int;
BEGIN
  SELECT count(*)::int INTO incoming FROM _t01_xano_app_billing;
  SELECT count(*)::int INTO xero_n
    FROM _t01_xano_app_billing
   WHERE invoice_key LIKE 'xero:%';
  SELECT count(*)::int INTO to_insert
    FROM _t01_xano_app_billing s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.finance_billing_records t
      WHERE t.invoice_key = s.invoice_key
   );

  RAISE NOTICE 'T0-1 finance_billing_records backfill: incoming=% to_insert=%', incoming, to_insert;

  IF xero_n > 0 THEN
    RAISE EXCEPTION
      'T0-1 abort: % incoming invoice_key values start with xero: — app backfill must never touch xero: rows',
      xero_n;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.migration_markers
     WHERE key = '0051_finance_billing_records_backfill'
  ) THEN
    INSERT INTO public.finance_billing_records (
      invoice_key, clients_id, client_name, billing_type, mba_number, campaign_name,
      po_number, billing_month, invoice_date, payment_days, payment_terms, status,
      total, has_pending_edits, source_billing_schedule_id, billed, billed_at,
      billed_by, notes, billed_amount_cents, billed_lines_hash, created_at, updated_at
    )
    SELECT
      s.invoice_key, s.clients_id, s.client_name, s.billing_type, s.mba_number, s.campaign_name,
      s.po_number, s.billing_month, s.invoice_date, s.payment_days, s.payment_terms, s.status,
      s.total, s.has_pending_edits, s.source_billing_schedule_id, s.billed, s.billed_at,
      s.billed_by, s.notes, s.billed_amount_cents, s.billed_lines_hash, s.created_at, now()
    FROM _t01_xano_app_billing s
    WHERE s.invoice_key NOT LIKE 'xero:%'
      AND NOT EXISTS (
        SELECT 1 FROM public.finance_billing_records t
         WHERE t.invoice_key = s.invoice_key
      );

    INSERT INTO public.migration_markers (key, note)
    VALUES (
      '0051_finance_billing_records_backfill',
      'App-written Xano finance_billing_records missing from Postgres, matched on invoice_key. Live 1 Sep 2026: 0 missing (1 media: row already present).'
    );
  ELSE
    RAISE NOTICE '0051: finance_billing_records backfill already applied — skipping.';
  END IF;
END
$$;
