/**
 * Xero AR actuals for Investment cut — MBA×month grain only.
 *
 * Prefer: xero_ar_invoices → xero_invoice_matches → finance_run_items
 * Fallback: xero_ar_invoices.mba_number (T5 reference parse) + issue_date month.
 * Never prorate to publisher/channel.
 *
 * SQL note: use CAST(... AS type), never a dangling `expr:: AS alias` (syntax error).
 */

import { sql } from "drizzle-orm"
import { getDb } from "@/db"
import { SCHEDULE_LINE_JOIN_SQL } from "@/lib/finance/sections/scheduleLineJoinSql"
import {
  AR_COVERAGE_NOTE,
  type InvestmentCutDim,
  type InvestmentCutNormalized,
  type InvestmentCutRow,
} from "./cutTypes"
import { measuresIncludeActuals } from "./cutGrain"

function monthStartDate(yyyyMm: string): string {
  return `${yyyyMm}-01`
}

function monthEndExclusive(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map((x) => Number.parseInt(x, 10))
  const d = new Date(y!, m! - 1, 1)
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

function asNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "bigint") return Number(v)
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function executeRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  const r = result as { rows?: Record<string, unknown>[] }
  return Array.isArray(r.rows) ? r.rows : []
}

function clientFilterSql(clientIds: number[]): string {
  if (!clientIds.length) return "TRUE"
  return `m.client_id = ANY(ARRAY[${clientIds.join(",")}]::bigint[])`
}

/**
 * Invoice → MBA×month grain.
 * Match path when PC6 rows exist; otherwise T5 mba_number + issue_date month.
 */
export function arMbaMonthCteText(fromDate: string, toExclusive: string): string {
  return `
ar_mba_month AS (
  SELECT
    mba_number,
    activity_month,
    CAST(SUM(invoiced_cents) AS bigint) AS invoiced_cents,
    CAST(SUM(paid_cents) AS bigint) AS paid_cents
  FROM (
    SELECT
      COALESCE(
        NULLIF(BTRIM(ri.mba_number), ''),
        NULLIF(BTRIM(ar.mba_number), '')
      ) AS mba_number,
      COALESCE(
        to_char(CAST(date_trunc('month', xm.period_month) AS date), 'YYYY-MM'),
        to_char(CAST(date_trunc('month', fp.period_month) AS date), 'YYYY-MM'),
        to_char(CAST(date_trunc('month', ar.issue_date) AS date), 'YYYY-MM')
      ) AS activity_month,
      CAST(ROUND(CAST(COALESCE(ar.sub_total, 0) AS numeric) * 100) AS bigint) AS invoiced_cents,
      CAST(ROUND(CAST(COALESCE(ar.amount_paid, 0) AS numeric) * 100) AS bigint) AS paid_cents
    FROM xero_ar_invoices ar
    LEFT JOIN xero_invoice_matches xm
      ON xm.xero_invoice_id = ar.xero_invoice_id
      AND xm.status::text IN ('matched', 'written_off', 'disputed')
    LEFT JOIN finance_run_items ri ON ri.id = xm.run_item_id
    LEFT JOIN finance_periods fp ON fp.id = ri.period_id
    WHERE COALESCE(ar.status, '') NOT IN ('DELETED', 'VOIDED')
  ) raw
  WHERE mba_number IS NOT NULL
    AND activity_month IS NOT NULL
    AND to_date(activity_month || '-01', 'YYYY-MM-DD') >= DATE '${fromDate}'
    AND to_date(activity_month || '-01', 'YYYY-MM-DD') < DATE '${toExclusive}'
  GROUP BY 1, 2
)`.trim()
}

function dimKey(dims: InvestmentCutRow["dims"], order: InvestmentCutDim[]): string {
  return order.map((d) => `${d}=${JSON.stringify(dims[d] ?? null)}`).join("|")
}

/**
 * Fetch AR rolled to the cut's MBA-grain dimensions and merge into booked rows.
 */
export async function attachActualsMeasures(
  q: InvestmentCutNormalized,
  rows: InvestmentCutRow[],
  totals: Partial<Record<string, number>>
): Promise<{
  rows: InvestmentCutRow[]
  totals: Partial<Record<string, number>>
  arCoverage: {
    matchedPct: number
    bookedBillableCents: number
    bookedWithArLinkCents: number
    note: string
  }
  arSqlText: string
}> {
  if (!measuresIncludeActuals(q.measures)) {
    return {
      rows,
      totals,
      arCoverage: {
        matchedPct: 100,
        bookedBillableCents: 0,
        bookedWithArLinkCents: 0,
        note: AR_COVERAGE_NOTE,
      },
      arSqlText: "",
    }
  }

  const db = getDb()
  const fromDate = monthStartDate(q.from)
  const toExclusive = monthEndExclusive(q.to)
  const wantsInvoiced = q.measures.includes("invoiced_cents")
  const wantsPaid = q.measures.includes("paid_cents")
  const wantsDelta = q.measures.includes("invoiced_delta_cents")

  const dims = q.dimensions
  const selectDims: string[] = []
  for (const dim of dims) {
    if (dim === "client") {
      selectDims.push(
        `COALESCE(NULLIF(BTRIM(c.mp_client_name), ''), NULLIF(BTRIM(m.mp_client_name), ''), 'Unknown') AS dim_client`
      )
    } else if (dim === "month") {
      selectDims.push(`amm.activity_month AS dim_month`)
    } else if (dim === "fy") {
      selectDims.push(`${q.fy} AS dim_fy`)
    }
  }

  const clientWhere = clientFilterSql(q.filters.clients)
  const selectList = selectDims.length
    ? `${selectDims.join(",\n  ")},\n  COALESCE(SUM(amm.invoiced_cents), 0) AS invoiced_cents,\n  COALESCE(SUM(amm.paid_cents), 0) AS paid_cents`
    : `COALESCE(SUM(amm.invoiced_cents), 0) AS invoiced_cents,\n  COALESCE(SUM(amm.paid_cents), 0) AS paid_cents`
  const groupBy = selectDims.length
    ? `GROUP BY ${selectDims.map((_, i) => String(i + 1)).join(", ")}`
    : ""

  const arAggSqlText = `
WITH ${arMbaMonthCteText(fromDate, toExclusive)}
SELECT
  ${selectList}
FROM ar_mba_month amm
INNER JOIN media_plan_masters m ON m.mba_number = amm.mba_number
LEFT JOIN clients c ON c.id = m.client_id
WHERE ${clientWhere}
${groupBy}
`.trim()

  const arResult = await db.execute(sql.raw(arAggSqlText))
  const arRows = executeRows(arResult)
  const arMap = new Map<
    string,
    { invoiced: number; paid: number; dims: InvestmentCutRow["dims"] }
  >()
  let arTotalInvoiced = 0
  let arTotalPaid = 0

  for (const r of arRows) {
    const dimsObj: InvestmentCutRow["dims"] = {}
    for (const dim of dims) {
      if (dim === "client") dimsObj.client = r.dim_client == null ? null : String(r.dim_client)
      else if (dim === "month") dimsObj.month = r.dim_month == null ? null : String(r.dim_month)
      else if (dim === "fy") dimsObj.fy = asNumber(r.dim_fy)
    }
    const invoiced = asNumber(r.invoiced_cents)
    const paid = asNumber(r.paid_cents)
    arTotalInvoiced += invoiced
    arTotalPaid += paid
    arMap.set(dimKey(dimsObj, dims), { invoiced, paid, dims: dimsObj })
  }

  // AR-only keys (no booked billable) still surface when Actuals are requested.
  const seen = new Set(rows.map((row) => dimKey(row.dims, dims)))
  const merged = rows.map((row) => {
    const key = dimKey(row.dims, dims)
    const ar = arMap.get(key)
    const invoiced = ar?.invoiced ?? 0
    const paid = ar?.paid ?? 0
    const billable = row.measures.billable_cents ?? 0
    const next = { ...row, measures: { ...row.measures } }
    if (wantsInvoiced) next.measures.invoiced_cents = invoiced
    if (wantsPaid) next.measures.paid_cents = paid
    if (wantsDelta) next.measures.invoiced_delta_cents = billable - invoiced
    return next
  })

  for (const [key, ar] of arMap) {
    if (seen.has(key)) continue
    const row: InvestmentCutRow = { dims: ar.dims, measures: {} }
    if (wantsInvoiced) row.measures.invoiced_cents = ar.invoiced
    if (wantsPaid) row.measures.paid_cents = ar.paid
    if (wantsDelta) row.measures.invoiced_delta_cents = -ar.invoiced
    if (q.measures.includes("billable_cents")) row.measures.billable_cents = 0
    merged.push(row)
  }

  const nextTotals = { ...totals }
  if (wantsInvoiced) nextTotals.invoiced_cents = arTotalInvoiced
  if (wantsPaid) nextTotals.paid_cents = arTotalPaid
  if (wantsDelta) {
    const billableTotal = totals.billable_cents ?? 0
    nextTotals.invoiced_delta_cents = billableTotal - arTotalInvoiced
  }

  const deliveryGate =
    q.basis === "delivery"
      ? `AND (
    sm.component <> 'media'
    OR COALESCE(li.client_pays_for_media, FALSE) = FALSE
  )`
      : ""

  const coverageSql = `
WITH booked AS (
  SELECT
    m.mba_number,
    to_char(CAST(date_trunc('month', sm.month) AS date), 'YYYY-MM') AS activity_month,
    CAST(SUM(sm.amount_cents) AS bigint) AS billable_cents
  FROM media_plan_masters m
  INNER JOIN media_plan_versions v ON v.id = m.published_version_id
  INNER JOIN schedule_months sm ON sm.version_id = v.id
    AND sm.basis = '${q.basis}'
    AND sm.component IN ('media', 'fee', 'adserving')
    AND sm.month >= DATE '${fromDate}'
    AND sm.month < DATE '${toExclusive}'
  LEFT JOIN LATERAL (
    SELECT li.*
    FROM line_items li
    WHERE ${SCHEDULE_LINE_JOIN_SQL}
    LIMIT 1
  ) li ON TRUE
  WHERE m.published_version_id IS NOT NULL
    AND LOWER(COALESCE(v.campaign_status, '')) IN ('approved', 'booked', 'completed')
    ${deliveryGate}
    AND ${clientWhere}
  GROUP BY 1, 2
),
ar_keys AS (
  SELECT DISTINCT mba_number, activity_month
  FROM (
    SELECT
      COALESCE(
        NULLIF(BTRIM(ri.mba_number), ''),
        NULLIF(BTRIM(ar.mba_number), '')
      ) AS mba_number,
      COALESCE(
        to_char(CAST(date_trunc('month', xm.period_month) AS date), 'YYYY-MM'),
        to_char(CAST(date_trunc('month', fp.period_month) AS date), 'YYYY-MM'),
        to_char(CAST(date_trunc('month', ar.issue_date) AS date), 'YYYY-MM')
      ) AS activity_month
    FROM xero_ar_invoices ar
    LEFT JOIN xero_invoice_matches xm
      ON xm.xero_invoice_id = ar.xero_invoice_id
      AND xm.status::text IN ('matched', 'written_off', 'disputed')
    LEFT JOIN finance_run_items ri ON ri.id = xm.run_item_id
    LEFT JOIN finance_periods fp ON fp.id = ri.period_id
    WHERE COALESCE(ar.status, '') NOT IN ('DELETED', 'VOIDED')
  ) k
  WHERE mba_number IS NOT NULL AND activity_month IS NOT NULL
)
SELECT
  COALESCE(SUM(b.billable_cents), 0) AS booked_billable_cents,
  COALESCE(SUM(CASE WHEN a.mba_number IS NOT NULL THEN b.billable_cents ELSE 0 END), 0) AS booked_with_ar_cents
FROM booked b
LEFT JOIN ar_keys a
  ON a.mba_number = b.mba_number
 AND a.activity_month = b.activity_month
`.trim()

  const coverageResult = await db.execute(sql.raw(coverageSql))
  const cov = executeRows(coverageResult)[0] ?? {}
  const bookedBillableCents = asNumber(cov.booked_billable_cents)
  const bookedWithArLinkCents = asNumber(cov.booked_with_ar_cents)

  return {
    rows: merged,
    totals: nextTotals,
    arCoverage: {
      matchedPct:
        bookedBillableCents === 0
          ? 100
          : Math.round((bookedWithArLinkCents / bookedBillableCents) * 1000) / 10,
      bookedBillableCents,
      bookedWithArLinkCents,
      note: AR_COVERAGE_NOTE,
    },
    arSqlText: arAggSqlText,
  }
}
