/**
 * FIN-7 discovery: fill rates of descriptive fields on pending finance_billing_records.
 * Usage: node --import ./scripts/test-shims/register-server-only.mjs --require ./scripts/test-shims/mock-server-only.cjs --import tsx scripts/verify/fin7-pending-field-fill.ts
 */
import { sql } from "drizzle-orm"
import { closeDb, getDb } from "@/db"
import { loadEnvLocal } from "../migration/_shared"

loadEnvLocal()

async function main() {
  const db = getDb()

  const summary = await db.execute(sql`
WITH pending AS (
  SELECT
    f.id,
    f.invoice_key,
    f.client_name,
    f.campaign_name,
    f.po_number,
    f.notes,
    f.mba_number,
    NULLIF(trim(f.client_name), '') AS client_name_nz,
    NULLIF(trim(f.campaign_name), '') AS campaign_name_nz,
    NULLIF(trim(f.po_number), '') AS po_number_nz,
    NULLIF(trim(f.notes), '') AS notes_nz,
    NULLIF(trim(f.mba_number), '') AS mba_number_nz,
    CASE
      WHEN f.invoice_key LIKE 'xero:%' THEN substring(f.invoice_key from 6)
      ELSE NULL
    END AS xero_invoice_id
  FROM finance_billing_records f
  WHERE f.has_pending_edits IS TRUE
),
joined AS (
  SELECT
    p.*,
    a.reference_raw,
    a.invoice_number,
    a.line_items_json,
    a.raw_json,
    c.name AS contact_name,
    NULLIF(trim(a.reference_raw), '') AS reference_nz,
    NULLIF(trim(a.invoice_number), '') AS invoice_number_nz,
    NULLIF(trim(c.name), '') AS contact_name_nz,
    NULLIF(trim(COALESCE(a.line_items_json->0->>'Description', '')), '') AS first_line_desc_nz,
    NULLIF(
      trim(
        COALESCE(
          a.raw_json->>'Narration',
          a.raw_json->>'narration',
          ''
        )
      ),
      ''
    ) AS narration_nz,
    (
      SELECT string_agg(NULLIF(trim(li->>'Description'), ''), ' | ')
      FROM jsonb_array_elements(COALESCE(a.line_items_json, '[]'::jsonb)) li
      WHERE NULLIF(trim(li->>'Description'), '') IS NOT NULL
    ) AS all_line_descs
  FROM pending p
  LEFT JOIN xero_ar_invoices a ON a.xero_invoice_id = p.xero_invoice_id
  LEFT JOIN xero_contacts c ON c.xero_contact_id = a.xero_contact_id
)
SELECT
  count(*)::int AS pending_total,
  count(*) FILTER (WHERE invoice_key LIKE 'xero:%')::int AS xero_keyed,
  count(*) FILTER (WHERE reference_raw IS NOT NULL OR invoice_number IS NOT NULL)::int AS joined_ar,
  count(*) FILTER (WHERE reference_nz IS NOT NULL)::int AS reference_filled,
  count(*) FILTER (WHERE first_line_desc_nz IS NOT NULL)::int AS first_line_desc_filled,
  count(*) FILTER (WHERE all_line_descs IS NOT NULL)::int AS any_line_desc_filled,
  count(*) FILTER (WHERE contact_name_nz IS NOT NULL)::int AS contact_name_filled,
  count(*) FILTER (WHERE client_name_nz IS NOT NULL)::int AS billing_client_name_filled,
  count(*) FILTER (WHERE narration_nz IS NOT NULL)::int AS narration_filled,
  count(*) FILTER (WHERE campaign_name_nz IS NOT NULL)::int AS campaign_name_filled,
  count(*) FILTER (WHERE po_number_nz IS NOT NULL)::int AS po_number_filled,
  count(*) FILTER (WHERE notes_nz IS NOT NULL)::int AS notes_filled,
  count(*) FILTER (WHERE invoice_number_nz IS NOT NULL)::int AS invoice_number_filled,
  count(*) FILTER (WHERE mba_number_nz IS NOT NULL)::int AS mba_filled,
  count(*) FILTER (WHERE reference_nz IS NOT NULL OR first_line_desc_nz IS NOT NULL)::int AS usable_desc_or_ref,
  count(*) FILTER (WHERE reference_nz IS NOT NULL AND first_line_desc_nz IS NOT NULL)::int AS both_ref_and_desc,
  count(*) FILTER (WHERE reference_nz IS NULL AND first_line_desc_nz IS NULL)::int AS neither_ref_nor_desc
FROM joined
`)

  console.log("=== FILL RATES ===")
  console.log(JSON.stringify(summary, null, 2))

  const samples = await db.execute(sql`
WITH pending AS (
  SELECT
    f.*,
    CASE
      WHEN f.invoice_key LIKE 'xero:%' THEN substring(f.invoice_key from 6)
      ELSE NULL
    END AS xero_invoice_id
  FROM finance_billing_records f
  WHERE f.has_pending_edits IS TRUE
)
SELECT
  p.invoice_key,
  left(COALESCE(a.reference_raw, ''), 80) AS reference_raw,
  left(COALESCE(a.line_items_json->0->>'Description', ''), 100) AS first_line_desc,
  left(COALESCE(c.name, ''), 60) AS contact_name,
  left(COALESCE(p.client_name, ''), 60) AS billing_client_name,
  left(COALESCE(p.campaign_name, ''), 60) AS campaign_name,
  left(COALESCE(p.po_number, ''), 40) AS po_number,
  left(COALESCE(a.raw_json->>'Narration', ''), 40) AS narration,
  a.invoice_number
FROM pending p
LEFT JOIN xero_ar_invoices a ON a.xero_invoice_id = p.xero_invoice_id
LEFT JOIN xero_contacts c ON c.xero_contact_id = a.xero_contact_id
ORDER BY p.billing_month NULLS LAST, p.invoice_key
LIMIT 15
`)

  console.log("=== SAMPLE ROWS ===")
  console.log(JSON.stringify(samples, null, 2))

  const keys = await db.execute(sql`
WITH pending AS (
  SELECT
    CASE
      WHEN f.invoice_key LIKE 'xero:%' THEN substring(f.invoice_key from 6)
      ELSE NULL
    END AS xero_invoice_id
  FROM finance_billing_records f
  WHERE f.has_pending_edits IS TRUE
  LIMIT 50
)
SELECT DISTINCT jsonb_object_keys(a.raw_json) AS key
FROM pending p
JOIN xero_ar_invoices a ON a.xero_invoice_id = p.xero_invoice_id
WHERE a.raw_json IS NOT NULL
ORDER BY 1
`)
  console.log("=== raw_json TOP-LEVEL KEYS (sample of pending AR) ===")
  console.log(JSON.stringify(keys, null, 2))

  await closeDb()
}

main().catch(async (err) => {
  console.error(err)
  try {
    await closeDb()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
