/**
 * Attach forecast-mapped retainer/SOW + composed revenue/margin onto cut rows.
 * Retainer rule mirrors buildClientLevelRevenueLines#client_monthlyretainer.
 * SOW/PRIP stays zeros (forecast placeholder).
 */

import { sql } from "drizzle-orm"
import { getDb } from "@/db"
import {
  composeAgencyRevenueCents,
  INCLUDE_ADSERVING_IN_AGENCY_REVENUE,
  marginPct,
  measuresIncludeAgencyEconomics,
  monthsInRange,
  AGENCY_ECONOMICS_ADSERVING_CAPTION,
  AGENCY_ECONOMICS_CURRENT_FY_CAPTION,
  AGENCY_ECONOMICS_SOW_CAPTION,
  forecastRetainerMappingRef,
} from "./agencyEconomics"
import type { InvestmentCutNormalized, InvestmentCutRow } from "./cutTypes"

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

function normalizeClientName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Dollars/month from clients.monthlyretainer → cents for months in cut range.
 * Same field + even-month rule as forecast mapping (CLIENT_FIELD_MONTHLY_RETAINER).
 */
export async function loadRetainerCentsByClientName(
  from: string,
  to: string
): Promise<
  Map<string, { displayName: string; monthlyCents: number; rangeCents: number }>
> {
  const db = getDb()
  const result = await db.execute(sql`
    SELECT
      COALESCE(NULLIF(BTRIM(mp_client_name), ''), 'Unknown') AS client_name,
      COALESCE(monthlyretainer, 0) AS monthlyretainer
    FROM clients
    WHERE COALESCE(monthlyretainer, 0) > 0
  `)
  const months = monthsInRange(from, to)
  const monthCount = Math.max(1, months.length)
  const map = new Map<
    string,
    { displayName: string; monthlyCents: number; rangeCents: number }
  >()
  for (const r of executeRows(result)) {
    const displayName = String(r.client_name ?? "Unknown")
    const monthlyDollars = asNumber(r.monthlyretainer)
    const monthlyCents = Math.round(monthlyDollars * 100)
    map.set(normalizeClientName(displayName), {
      displayName,
      monthlyCents,
      rangeCents: monthlyCents * monthCount,
    })
  }
  return map
}

export type AgencyEconomicsMeta = {
  caption: string
  retainerMappingRef: string
  includeAdservingInRevenue: boolean
  sowNote: string
}

export async function attachAgencyEconomicsMeasures(
  q: InvestmentCutNormalized,
  rows: InvestmentCutRow[],
  totals: Partial<Record<string, number>>
): Promise<{
  rows: InvestmentCutRow[]
  totals: Partial<Record<string, number>>
  agency?: AgencyEconomicsMeta
}> {
  if (!measuresIncludeAgencyEconomics(q.measures)) {
    return { rows, totals }
  }

  const wantsRetainer = q.measures.includes("retainer_cents")
  const wantsSow = q.measures.includes("sow_cents")
  const wantsRevenue = q.measures.includes("revenue_cents")
  const wantsMargin = q.measures.includes("margin_pct")
  const hasMonth = q.dimensions.includes("month")
  const hasClient = q.dimensions.includes("client")

  const retainerByClient = wantsRetainer || wantsRevenue || wantsMargin
    ? await loadRetainerCentsByClientName(q.from, q.to)
    : new Map()

  let totalRetainer = 0
  let totalSow = 0
  let totalRevenue = 0

  const merged = rows.map((row) => {
    const fee = row.measures.fee_cents ?? 0
    const adserving = row.measures.adserving_cents ?? 0
    const billable = row.measures.billable_cents ?? 0
    const clientName =
      row.dims.client == null ? "" : normalizeClientName(String(row.dims.client))
    const retainerInfo = clientName ? retainerByClient.get(clientName) : undefined

    let retainer = 0
    if (hasClient && retainerInfo) {
      retainer = hasMonth ? retainerInfo.monthlyCents : retainerInfo.rangeCents
    }
    // SOW/PRIP — forecast placeholder (always 0)
    const sow = 0

    const revenue = composeAgencyRevenueCents({
      feeCents: fee,
      retainerCents: retainer,
      sowCents: sow,
      adservingCents: adserving,
    })

    totalRetainer += retainer
    totalSow += sow
    totalRevenue += revenue

    const next = { ...row, measures: { ...row.measures } }
    if (wantsRetainer) next.measures.retainer_cents = retainer
    if (wantsSow) next.measures.sow_cents = sow
    if (wantsRevenue) next.measures.revenue_cents = revenue
    if (wantsMargin) {
      const pct = marginPct(revenue, billable)
      if (pct == null) delete next.measures.margin_pct
      else next.measures.margin_pct = pct
    }
    return next
  })

  // Clients with retainer but no booked cut row (still show revenue)
  if (hasClient && !hasMonth && (wantsRetainer || wantsRevenue || wantsMargin)) {
    const seen = new Set(
      merged.map((r) => normalizeClientName(String(r.dims.client ?? "")))
    )
    for (const [key, info] of retainerByClient) {
      if (seen.has(key)) continue
      const retainer = info.rangeCents
      const sow = 0
      const revenue = composeAgencyRevenueCents({
        feeCents: 0,
        retainerCents: retainer,
        sowCents: sow,
      })
      totalRetainer += retainer
      totalRevenue += revenue
      const measures: InvestmentCutRow["measures"] = {}
      if (wantsRetainer) measures.retainer_cents = retainer
      if (wantsSow) measures.sow_cents = sow
      if (wantsRevenue) measures.revenue_cents = revenue
      if (q.measures.includes("fee_cents")) measures.fee_cents = 0
      if (q.measures.includes("billable_cents") || wantsMargin) measures.billable_cents = 0
      merged.push({ dims: { client: info.displayName }, measures })
    }
  }

  const nextTotals = { ...totals }
  if (wantsRetainer) nextTotals.retainer_cents = totalRetainer
  if (wantsSow) nextTotals.sow_cents = totalSow
  if (wantsRevenue) {
    // Prefer recomposed from totals parts when fee/billable present
    const feeTotal = totals.fee_cents ?? 0
    nextTotals.revenue_cents = composeAgencyRevenueCents({
      feeCents: feeTotal,
      retainerCents: totalRetainer,
      sowCents: totalSow,
      adservingCents: totals.adserving_cents ?? 0,
    })
  }
  if (wantsMargin) {
    const rev = nextTotals.revenue_cents ?? totalRevenue
    const bill = totals.billable_cents ?? 0
    const pct = marginPct(rev, bill)
    if (pct == null) delete nextTotals.margin_pct
    else nextTotals.margin_pct = pct
  }

  return {
    rows: merged,
    totals: nextTotals,
    agency: {
      caption: [
        AGENCY_ECONOMICS_CURRENT_FY_CAPTION,
        AGENCY_ECONOMICS_ADSERVING_CAPTION,
        AGENCY_ECONOMICS_SOW_CAPTION,
      ].join(" "),
      retainerMappingRef: forecastRetainerMappingRef(),
      includeAdservingInRevenue: INCLUDE_ADSERVING_IN_AGENCY_REVENUE,
      sowNote: AGENCY_ECONOMICS_SOW_CAPTION,
    },
  }
}
