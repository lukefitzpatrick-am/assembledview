import { sql, type SQL } from "drizzle-orm"

import { RECORD_XERO_STATUS_SQL } from "@/lib/finance/revisions/loadRevisionContext"

/**
 * C-399 "billed means sent", in SQL: one row per billed invoice in `scope` (a
 * condition on unaliased `finance_billing_records`). A `xero:` row is the
 * invoice. An app record counts once sent to accounts, matched to Xero or
 * billed, and not when its matched invoice has a `xero:` row in the same scope,
 * so each invoice counts once. A voided or deleted Xero invoice is not billed.
 * A `xero:` row that an app record in scope matches counts in that record's
 * billing month (the earliest, if several); an unmatched one in its issue month.
 * Callers filter months on the output, not in `scope`.
 * Columns: `mba_number`, `billing_month` (trimmed), `cents` (billed amount,
 * else approved, else the stored total). Ava's finance summary and the S14
 * above-plan hold read it.
 */
export function billedSentSql(scope: SQL): SQL {
  return sql`WITH scoped AS (
    SELECT invoice_key, mba_number, billing_month, matched_xero_invoice_id, exported_at, billed,
      coalesce(billed_amount_cents, approved_amount_cents, round(total * 100)::bigint) AS cents,
      ${RECORD_XERO_STATUS_SQL} AS xero_status
    FROM finance_billing_records
    WHERE ${scope}
  )
  SELECT s.mba_number,
    CASE WHEN lower(btrim(s.invoice_key)) LIKE 'xero:%' THEN coalesce((
      SELECT min(btrim(a.billing_month)) FROM scoped a
      WHERE lower(btrim(a.invoice_key)) NOT LIKE 'xero:%'
        AND btrim(coalesce(a.billing_month, '')) <> ''
        AND 'xero:' || lower(btrim(a.matched_xero_invoice_id)) = lower(btrim(s.invoice_key))
    ), btrim(s.billing_month)) ELSE btrim(s.billing_month) END AS billing_month,
    s.cents
  FROM scoped s
  WHERE btrim(coalesce(s.billing_month, '')) <> ''
    AND upper(btrim(coalesce(s.xero_status, ''))) NOT IN ('VOIDED', 'DELETED')
    AND (
      lower(btrim(s.invoice_key)) LIKE 'xero:%'
      OR (
        (s.exported_at IS NOT NULL OR btrim(coalesce(s.matched_xero_invoice_id, '')) <> '' OR s.billed IS TRUE)
        AND NOT EXISTS (
          SELECT 1 FROM scoped x
          WHERE lower(btrim(x.invoice_key)) = 'xero:' || lower(btrim(s.matched_xero_invoice_id))
        )
      )
    )`
}
