/**
 * Stage b: import_billing_records — FY26+ AR → finance_billing_records (xero: keys only).
 * One INSERT … SELECT … ON CONFLICT over xero_ar_invoices. The SELECT mirrors
 * resolveClientFromContact, inferBillingType, parsePoNumber, mapXeroStatusToBillingStatus,
 * and projectXeroArToBillingAmounts (ex-GST sub_total, banker's cents).
 * Campaign name is media_plan_masters.id = mba_match_id. mba_number is the
 * invoice column, not the master id. First line description is line_items_json[0].Description.
 */

import { sql } from "drizzle-orm"

import { db } from "@/db"

import { rowsOf } from "../dbRows"

export type ImportBillingResult = {
  stage: "import_billing_records"
  ok: boolean
  error?: string
  imported: number
  pending_edits: number
  by_type: { media: number; retainer: number; sow: number }
  skipped_app_keys: number
}

export type ImportBillingExecutor = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>
}

/**
 * Single upsert. Contact-key normalisation matches normalizeContactKey
 * (strip " pty ltd", " limited", " ltd", " australia", in that order).
 */
export const IMPORT_BILLING_UPSERT_SQL = `
WITH shaped AS (
  SELECT
    a.xero_invoice_id,
    a.xero_contact_id,
    COALESCE(a.reference_raw, '') AS reference_raw,
    a.status AS xero_status,
    a.sub_total,
    a.issue_date,
    a.mba_number,
    a.mba_match_id,
    COALESCE(a.line_items_json->0->>'Description', '') AS first_desc,
    COALESCE(c.name, '') AS contact_name,
    lower(trim(COALESCE(c.name, ''))) AS raw_key,
    trim(
      replace(
        replace(
          replace(
            replace(lower(trim(COALESCE(c.name, ''))), ' pty ltd', ''),
            ' limited', ''
          ),
          ' ltd', ''
        ),
        ' australia', ''
      )
    ) AS contact_norm
  FROM xero_ar_invoices a
  LEFT JOIN xero_contacts c ON c.xero_contact_id = a.xero_contact_id
  WHERE a.issue_date >= DATE '2025-07-01'
    AND a.xero_invoice_id IS NOT NULL
),
name_hits AS (
  SELECT norm, COUNT(*)::int AS n, MIN(id) AS only_id
  FROM (
    SELECT
      id,
      trim(
        replace(
          replace(
            replace(
              replace(lower(trim(COALESCE(mp_client_name, ''))), ' pty ltd', ''),
              ' limited', ''
            ),
            ' ltd', ''
          ),
          ' australia', ''
        )
      ) AS norm
    FROM clients
  ) cn
  WHERE norm <> ''
  GROUP BY norm
),
link_pick AS (
  SELECT DISTINCT ON (s.xero_invoice_id)
    s.xero_invoice_id,
    l.client_id
  FROM shaped s
  JOIN xero_contact_links l
    ON (
      s.xero_contact_id IS NOT NULL
      AND l.xero_contact_key = s.xero_contact_id
    )
    OR (
      s.contact_norm <> ''
      AND (
        l.xero_contact_key = s.contact_norm
        OR trim(
          replace(
            replace(
              replace(
                replace(lower(trim(COALESCE(l.xero_contact_key, ''))), ' pty ltd', ''),
                ' limited', ''
              ),
              ' ltd', ''
            ),
            ' australia', ''
          )
        ) = s.contact_norm
      )
    )
  ORDER BY s.xero_invoice_id,
    CASE
      WHEN s.xero_contact_id IS NOT NULL AND l.xero_contact_key = s.xero_contact_id THEN 0
      WHEN l.xero_contact_key = s.contact_norm THEN 1
      ELSE 2
    END,
    l.id
),
chosen AS (
  SELECT
    s.*,
    CASE
      WHEN lc.id IS NOT NULL THEN lc.id
      WHEN COALESCE(nh.n, 0) = 1 THEN nh.only_id
      WHEN COALESCE(nh.n, 0) >= 2 THEN NULL
      WHEN ac_raw.id IS NOT NULL THEN alias_raw.client_id
      WHEN ac_norm.id IS NOT NULL THEN alias_norm.client_id
      ELSE NULL
    END AS chosen_client_id
  FROM shaped s
  LEFT JOIN link_pick lp ON lp.xero_invoice_id = s.xero_invoice_id
  LEFT JOIN clients lc ON lc.id = lp.client_id
  LEFT JOIN name_hits nh ON nh.norm = s.contact_norm AND s.contact_norm <> ''
  LEFT JOIN xero_client_aliases alias_raw ON alias_raw.contact_key = s.raw_key
  LEFT JOIN clients ac_raw ON ac_raw.id = alias_raw.client_id
  LEFT JOIN xero_client_aliases alias_norm
    ON alias_norm.contact_key = s.contact_norm AND s.contact_norm <> ''
  LEFT JOIN clients ac_norm ON ac_norm.id = alias_norm.client_id
),
projected AS (
  SELECT
    'xero:' || c.xero_invoice_id AS invoice_key,
    COALESCE(cl.id, 0) AS clients_id,
    COALESCE(NULLIF(cl.mp_client_name, ''), c.contact_name, '') AS client_name,
    CASE
      WHEN lower(c.reference_raw) LIKE '%retainer%'
        OR lower(c.first_desc) LIKE '%retainer%' THEN 'retainer'
      WHEN lower(c.reference_raw) LIKE '%\\_sow%' ESCAPE '\\'
        OR lower(c.reference_raw) LIKE '%scope of work%' THEN 'sow'
      ELSE 'media'
    END AS billing_type,
    COALESCE(c.mba_number, '') AS mba_number,
    CASE
      WHEN c.mba_match_id IS NULL THEN ''
      ELSE COALESCE(m.campaign_name, '')
    END AS campaign_name,
    CASE
      WHEN c.reference_raw LIKE '% | %' THEN COALESCE((
        SELECT trim(seg)
        FROM unnest(string_to_array(c.reference_raw, ' | ')) AS seg
        WHERE trim(seg) LIKE 'PO %'
        LIMIT 1
      ), '')
      WHEN trim(c.reference_raw) LIKE 'PO %' THEN trim(c.reference_raw)
      ELSE ''
    END AS po_number,
    CASE
      WHEN c.issue_date IS NULL THEN NULL
      ELSE to_char(c.issue_date::date, 'YYYY-MM')
    END AS billing_month,
    c.issue_date::date AS invoice_date,
    COALESCE(cl.payment_days, 14) AS payment_days,
    COALESCE(cl.payment_terms, '') AS payment_terms,
    CASE c.xero_status
      WHEN 'PAID' THEN 'paid'
      WHEN 'AUTHORISED' THEN 'invoiced'
      WHEN 'SUBMITTED' THEN 'invoiced'
      WHEN 'VOIDED' THEN 'cancelled'
      WHEN 'DELETED' THEN 'cancelled'
      WHEN 'DRAFT' THEN 'draft'
      ELSE 'invoiced'
    END AS status,
    ROUND(COALESCE(c.sub_total, 0)::numeric, 2) AS total,
    CASE
      WHEN c.issue_date IS NULL THEN NULL
      ELSE (c.issue_date::date::text || 'T00:00:00+00:00')::timestamptz
    END AS billed_at,
    (
      COALESCE(cl.id, 0) = 0
      OR (
        CASE
          WHEN lower(c.reference_raw) LIKE '%retainer%'
            OR lower(c.first_desc) LIKE '%retainer%' THEN 'retainer'
          WHEN lower(c.reference_raw) LIKE '%\\_sow%' ESCAPE '\\'
            OR lower(c.reference_raw) LIKE '%scope of work%' THEN 'sow'
          ELSE 'media'
        END = 'media'
        AND COALESCE(c.mba_number, '') = ''
      )
    ) AS has_pending_edits,
    (
      CASE
        WHEN abs(sc.scaled - trunc(sc.scaled)) > 0.5 THEN trunc(sc.scaled) + sign(sc.scaled)
        WHEN abs(sc.scaled - trunc(sc.scaled)) < 0.5 THEN trunc(sc.scaled)
        WHEN mod(trunc(sc.scaled)::bigint, 2) = 0 THEN trunc(sc.scaled)
        ELSE trunc(sc.scaled) + sign(sc.scaled)
      END
    )::bigint AS billed_amount_cents
  FROM chosen c
  LEFT JOIN clients cl ON cl.id = c.chosen_client_id
  LEFT JOIN media_plan_masters m ON m.id = c.mba_match_id
  CROSS JOIN LATERAL (
    SELECT (COALESCE(c.sub_total, 0)::numeric * 100) AS scaled
  ) sc
),
upserted AS (
  INSERT INTO finance_billing_records (
    invoice_key, clients_id, client_name, billing_type, mba_number,
    campaign_name, po_number, billing_month, invoice_date, payment_days,
    payment_terms, status, total, billed, billed_at, billed_by,
    has_pending_edits, source_billing_schedule_id, notes, updated_at,
    billed_amount_cents
  )
  SELECT
    invoice_key, clients_id, client_name, billing_type, mba_number,
    campaign_name, po_number, billing_month, invoice_date, payment_days,
    payment_terms, status, total, true, billed_at, 0,
    has_pending_edits, 0, '', now(),
    billed_amount_cents
  FROM projected
  ON CONFLICT (invoice_key) DO UPDATE SET
    clients_id = EXCLUDED.clients_id,
    client_name = EXCLUDED.client_name,
    billing_type = EXCLUDED.billing_type,
    mba_number = EXCLUDED.mba_number,
    campaign_name = EXCLUDED.campaign_name,
    po_number = EXCLUDED.po_number,
    billing_month = EXCLUDED.billing_month,
    invoice_date = EXCLUDED.invoice_date,
    payment_days = EXCLUDED.payment_days,
    payment_terms = EXCLUDED.payment_terms,
    status = EXCLUDED.status,
    total = EXCLUDED.total,
    billed = EXCLUDED.billed,
    billed_at = EXCLUDED.billed_at,
    has_pending_edits = EXCLUDED.has_pending_edits,
    billed_amount_cents = EXCLUDED.billed_amount_cents,
    updated_at = EXCLUDED.updated_at
  WHERE finance_billing_records.invoice_key LIKE 'xero:%'
  RETURNING billing_type, has_pending_edits
)
SELECT
  count(*)::int AS imported,
  count(*) FILTER (WHERE has_pending_edits)::int AS pending_edits,
  count(*) FILTER (WHERE billing_type = 'media')::int AS media,
  count(*) FILTER (WHERE billing_type = 'retainer')::int AS retainer,
  count(*) FILTER (WHERE billing_type = 'sow')::int AS sow
FROM upserted
`

type UpsertCounts = {
  imported: number | string
  pending_edits: number | string
  media: number | string
  retainer: number | string
  sow: number | string
}

function num(value: number | string | null | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export async function stageImportBillingRecords(opts?: {
  execute?: ImportBillingExecutor["execute"]
}): Promise<ImportBillingResult> {
  const execute = opts?.execute ?? ((query) => db.execute(query))
  try {
    const result = await execute(sql.raw(IMPORT_BILLING_UPSERT_SQL))
    const row = rowsOf<UpsertCounts>(result)[0]
    return {
      stage: "import_billing_records",
      ok: true,
      imported: num(row?.imported),
      pending_edits: num(row?.pending_edits),
      by_type: {
        media: num(row?.media),
        retainer: num(row?.retainer),
        sow: num(row?.sow),
      },
      skipped_app_keys: 0,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      stage: "import_billing_records",
      ok: false,
      error: msg,
      imported: 0,
      pending_edits: 0,
      by_type: { media: 0, retainer: 0, sow: 0 },
      skipped_app_keys: 0,
    }
  }
}
