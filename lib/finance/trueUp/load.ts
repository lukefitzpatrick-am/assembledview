/**
 * True-up loader (Stage 1, read only). SELECTs only, never writes.
 *
 * Plan of record: billing-basis schedule_months on the published version
 * (pointer AND stamp, PUBLISHED_VERSION_JOIN_SQL). Never max(version_number).
 * Invoiced: xero_ar_invoices lines. Matched records: finance_billing_records
 * media rows with a Xero match.
 */

import "server-only"

import { sql, type SQL } from "drizzle-orm"

import { getDb } from "@/db"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { LINE_PRODUCTION_SQL } from "@/lib/finance/loadPlanReconciliation"
import { PUBLISHED_VERSION_JOIN_SQL } from "@/lib/mediaplan/publishedVersionGuard"
import { rowsOf } from "@/lib/xero/dbRows"

import {
  addMonths,
  buildTrueUpReport,
  type TrueUpActionSqlRow,
  type TrueUpBillingTiming,
  type TrueUpInvoiceLinkSqlRow,
  type TrueUpInvoiceSqlRow,
  type TrueUpMatchedRecordSqlRow,
  type TrueUpPlanSqlRow,
  type TrueUpReport,
  type TrueUpScheduleSqlRow,
} from "./compute"
import { isTrueUpMigrationApplied } from "./marker"

export type TrueUpQueryRunner = (query: SQL) => Promise<unknown>

export function trueUpPlansSql(): SQL {
  return sql`
    SELECT
      m.id AS master_id,
      m.mba_number,
      m.client_id,
      m.mp_client_name,
      coalesce(nullif(v.campaign_name, ''), m.campaign_name) AS campaign_name,
      coalesce(v.campaign_status, m.campaign_status) AS campaign_status,
      to_char(coalesce(v.campaign_end_date, m.campaign_end_date), 'YYYY-MM-DD') AS campaign_end_date,
      v.id AS version_id,
      v.version_number
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v
      ON ${sql.raw(PUBLISHED_VERSION_JOIN_SQL)}
  `
}

export function trueUpScheduleSql(): SQL {
  return sql`
    SELECT
      m.mba_number,
      to_char(s.month, 'YYYY-MM') AS month,
      coalesce(sum(s.amount_cents) FILTER (WHERE s.component = 'fee'), 0) AS fee_cents,
      coalesce(sum(s.amount_cents) FILTER (WHERE s.component = 'adserving'), 0) AS adserving_cents,
      coalesce(sum(s.amount_cents) FILTER (WHERE s.component = 'media'), 0) AS media_cents,
      coalesce(sum(s.amount_cents) FILTER (WHERE s.line_item_id = '__service__production'), 0)
        AS service_production_cents,
      coalesce(sum(s.amount_cents) FILTER (WHERE s.component = 'media' AND ${sql.raw(LINE_PRODUCTION_SQL)}), 0)
        AS line_production_cents,
      coalesce(sum(s.amount_cents) FILTER (
        WHERE s.component = 'media'
          AND s.line_item_id <> '__service__production'
          AND EXISTS (
            SELECT 1 FROM line_items li
            WHERE li.version_id = s.version_id
              AND li.line_item_id = s.line_item_id
              AND li.client_pays_for_media IS TRUE
          )
      ), 0) AS client_pays_media_cents
    FROM media_plan_masters m
    INNER JOIN media_plan_versions v
      ON ${sql.raw(PUBLISHED_VERSION_JOIN_SQL)}
    INNER JOIN schedule_months s
      ON s.version_id = v.id
     AND s.basis = 'billing'
    GROUP BY m.mba_number, s.month
  `
}

/**
 * Invoices issued from one month before the window to three months after the
 * as-of month: a matched record can place an invoice in an earlier or later
 * billing month than its issue date.
 */
export function trueUpInvoicesSql(fromMonth: string, asOfMonth: string): SQL {
  const start = `${addMonths(fromMonth, -1)}-01`
  const end = `${addMonths(asOfMonth, 4)}-01`
  return sql`
    SELECT
      i.xero_invoice_id,
      i.invoice_number,
      i.status,
      to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date,
      i.mba_number,
      i.reference_raw,
      i.raw_json->>'SentToContact' AS sent_to_contact,
      i.raw_json->>'Type' AS invoice_type,
      i.raw_json->>'LineAmountTypes' AS line_amount_types,
      i.line_items_json
    FROM xero_ar_invoices i
    WHERE i.issue_date >= ${start}::date
      AND i.issue_date < ${end}::date
      AND coalesce(upper(i.status), '') NOT IN ('VOIDED', 'DELETED')
  `
}

export function trueUpMatchedRecordsSql(fromMonth: string, asOfMonth: string): SQL {
  return sql`
    SELECT
      r.matched_xero_invoice_id AS xero_invoice_id,
      r.invoice_key,
      r.mba_number,
      left(coalesce(r.billing_month, ''), 7) AS billing_month,
      r.matched_by
    FROM finance_billing_records r
    WHERE r.matched_xero_invoice_id IS NOT NULL
      AND r.invoice_key LIKE 'media:%'
      AND left(coalesce(r.billing_month, ''), 7) >= ${addMonths(fromMonth, -3)}
      AND left(coalesce(r.billing_month, ''), 7) <= ${addMonths(asOfMonth, 3)}
  `
}

/** 0109 only (marker gate first). */
export function trueUpInvoiceLinksSql(): SQL {
  return sql`
    SELECT xero_invoice_id, mba_number, to_char(billing_month, 'YYYY-MM') AS billing_month
    FROM true_up_invoice_links
  `
}

/** 0109 only (marker gate first). */
export function trueUpBillingTimingSql(): SQL {
  return sql`
    SELECT client_id, billing_timing
    FROM client_finance_owners
    WHERE billing_timing IS NOT NULL
  `
}

/** 0109 only (marker gate first). Applied ledger entries. */
export function trueUpActionsSql(): SQL {
  return sql`
    SELECT
      id, mba_number, component, action, gap_cents, amount_cents,
      to_char(as_of_month, 'YYYY-MM') AS as_of_month,
      billing_revision_id, reason_code, note, xero_invoice_id,
      created_at, created_by_name, months, strategy
    FROM true_up_actions
    WHERE status = 'applied'
    ORDER BY created_at DESC, id DESC
  `
}

export function trueUpLastSyncSql(): SQL {
  return sql`SELECT max(last_synced_at) AS last_synced_at FROM xero_ar_invoices`
}

export async function loadTrueUpWith(
  run: TrueUpQueryRunner,
  args: { asOfMonth: string; fromMonth: string; now?: Date; with0109?: boolean },
): Promise<TrueUpReport> {
  const [plans, schedule, invoices, matched, sync] = await Promise.all([
    run(trueUpPlansSql()),
    run(trueUpScheduleSql()),
    run(trueUpInvoicesSql(args.fromMonth, args.asOfMonth)),
    run(trueUpMatchedRecordsSql(args.fromMonth, args.asOfMonth)),
    run(trueUpLastSyncSql()),
  ])
  let invoiceLinks: TrueUpInvoiceLinkSqlRow[] | undefined
  let billingTiming: Record<string, TrueUpBillingTiming> | undefined
  let actions: TrueUpActionSqlRow[] | undefined
  if (args.with0109) {
    const [links, timing, acts] = await Promise.all([
      run(trueUpInvoiceLinksSql()),
      run(trueUpBillingTimingSql()),
      run(trueUpActionsSql()),
    ])
    invoiceLinks = rowsOf<TrueUpInvoiceLinkSqlRow>(links)
    billingTiming = {}
    for (const r of rowsOf<{ client_id: number | string; billing_timing: string | null }>(timing)) {
      const t = String(r.billing_timing ?? "")
      if (t === "same_month" || t === "month_ahead" || t === "in_arrears") billingTiming[String(r.client_id)] = t
    }
    actions = rowsOf<TrueUpActionSqlRow>(acts).map((a) => ({
      ...a,
      created_at: a.created_at == null ? "" : new Date(a.created_at as unknown as string).toISOString(),
    }))
  }
  const syncRow = rowsOf<{ last_synced_at: string | Date | null }>(sync)[0]
  const syncedAt = syncRow?.last_synced_at
  return buildTrueUpReport({
    asOfMonth: args.asOfMonth,
    fromMonth: args.fromMonth,
    plans: rowsOf<TrueUpPlanSqlRow>(plans),
    schedule: rowsOf<TrueUpScheduleSqlRow>(schedule),
    invoices: rowsOf<TrueUpInvoiceSqlRow>(invoices),
    matchedRecords: rowsOf<TrueUpMatchedRecordSqlRow>(matched),
    xeroSyncedAt: syncedAt == null ? null : new Date(syncedAt).toISOString(),
    generatedAt: (args.now ?? new Date()).toISOString(),
    invoiceLinks,
    billingTiming,
    actions,
  })
}

/** The report; with 0109 applied it also reads invoice links, billing timing and the ledger. */
export async function loadTrueUp(args: { asOfMonth: string; fromMonth: string }): Promise<TrueUpReport> {
  const db = getDb()
  const with0109 = await isTrueUpMigrationApplied()
  return loadTrueUpWith((query) => db.execute(query), { ...args, with0109 })
}

export function todaySydneyIso(): string {
  return getMelbourneTodayISO()
}
