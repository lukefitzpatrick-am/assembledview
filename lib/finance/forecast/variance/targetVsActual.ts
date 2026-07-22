/**
 * Phase-1 Finance Forecast variance: TARGET vs ACTUAL at client × month grain.
 *
 * Actual = sum of `finance_billing_records.billed_amount` (snapshotted at mark-billed).
 * That amount is MBA-month (or retainer client-month), NOT per revenue-line — so targets
 * are rolled up to client×month. Do not fabricate a per-line split.
 *
 * Booked (schedules) is a free reference series from `FinanceForecastDataset`.
 *
 * Phase-2 plug-in: replace / augment `actualByClientMonth` with a Xero AR feed keyed the
 * same way (`client_id` + `month_key`) before calling `buildTargetVsActualVariance`.
 */

import {
  FINANCE_FORECAST_FISCAL_MONTH_ORDER,
  FINANCE_FORECAST_LINE_KEYS,
  type FinanceForecastDataset,
  type FinanceForecastMonthKey,
  type FinanceForecastMonthlyAmounts,
} from "@/lib/types/financeForecast"
import { financeForecastVariancePercentChange } from "@/lib/finance/forecast/snapshot/varianceEngine"

export type TargetVsActualRag = "ahead" | "on_track" | "behind" | "critical"

export type TargetVsActualMonthAmounts = {
  month_key: FinanceForecastMonthKey
  target: number
  actual: number
  booked: number
  delta: number
  delta_pct: number | null
  rag: TargetVsActualRag
}

export type TargetVsActualClientRow = {
  client_id: string
  client_name: string
  months: TargetVsActualMonthAmounts[]
  fy: Omit<TargetVsActualMonthAmounts, "month_key">
}

export type TargetVsActualReport = {
  financial_year_start_year: number
  actual_source: "finance_billing_records.billed_amount"
  actual_grain: "client_month"
  phase: 1
  clients: TargetVsActualClientRow[]
  totals: Omit<TargetVsActualMonthAmounts, "month_key"> & {
    months: TargetVsActualMonthAmounts[]
  }
}

export type ClientMonthAmount = {
  client_id: string
  client_name: string
  month_key: FinanceForecastMonthKey
  amount: number
}

const CAL_MONTH_TO_KEY: Record<number, FinanceForecastMonthKey> = {
  1: "january",
  2: "february",
  3: "march",
  4: "april",
  5: "may",
  6: "june",
  7: "july",
  8: "august",
  9: "september",
  10: "october",
  11: "november",
  12: "december",
}

/** Map `YYYY-MM` billing_month → forecast `month_key`. */
export function billingMonthToForecastMonthKey(billingMonth: string): FinanceForecastMonthKey | null {
  const m = /^(\d{4})-(\d{2})$/.exec(billingMonth.trim())
  if (!m) return null
  const monthNum = Number.parseInt(m[2]!, 10)
  return CAL_MONTH_TO_KEY[monthNum] ?? null
}

export function emptyMonthlyAmounts(): FinanceForecastMonthlyAmounts {
  const m = {} as FinanceForecastMonthlyAmounts
  for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) m[k] = 0
  return m
}

function sumMonthly(m: FinanceForecastMonthlyAmounts): number {
  let t = 0
  for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) t += m[k] ?? 0
  return t
}

/**
 * RAG from target vs actual delta (actual − target).
 * Ahead when actual ≥ target; on_track within 5% shortfall; behind ≤15%; else critical.
 */
export function ragForTargetVsActual(target: number, actual: number): TargetVsActualRag {
  const delta = actual - target
  if (Math.abs(target) < 1e-9 && Math.abs(actual) < 1e-9) return "on_track"
  if (delta > 0) return "ahead"
  if (Math.abs(delta) < 1e-9) return "on_track"
  const base = Math.abs(target) < 1e-9 ? Math.abs(actual) : Math.abs(target)
  if (base < 1e-9) return "behind"
  const shortfallPct = Math.abs(delta) / base
  if (shortfallPct <= 0.05) return "on_track"
  if (shortfallPct <= 0.15) return "behind"
  return "critical"
}

export function measureDelta(target: number, actual: number): {
  delta: number
  delta_pct: number | null
  rag: TargetVsActualRag
} {
  const delta = actual - target
  return {
    delta,
    delta_pct: financeForecastVariancePercentChange(target, actual),
    rag: ragForTargetVsActual(target, actual),
  }
}

type ClientBucket = {
  client_name: string
  target: FinanceForecastMonthlyAmounts
  actual: FinanceForecastMonthlyAmounts
  booked: FinanceForecastMonthlyAmounts
}

function ensureBucket(map: Map<string, ClientBucket>, client_id: string, client_name: string): ClientBucket {
  let b = map.get(client_id)
  if (!b) {
    b = {
      client_name,
      target: emptyMonthlyAmounts(),
      actual: emptyMonthlyAmounts(),
      booked: emptyMonthlyAmounts(),
    }
    map.set(client_id, b)
  } else if (client_name && (!b.client_name || b.client_name === client_id)) {
    b.client_name = client_name
  }
  return b
}

/** Roll target line cells up to client × month (sum across line_key). */
export function rollTargetsToClientMonth(
  cells: ReadonlyArray<{
    client_id: string
    client_name?: string | null
    month_key: FinanceForecastMonthKey
    amount: number
  }>
): ClientMonthAmount[] {
  const map = new Map<string, ClientMonthAmount>()
  for (const cell of cells) {
    const key = `${cell.client_id}\u001f${cell.month_key}`
    const prev = map.get(key)
    if (prev) {
      prev.amount += cell.amount
      if (cell.client_name) prev.client_name = cell.client_name
    } else {
      map.set(key, {
        client_id: cell.client_id,
        client_name: cell.client_name?.trim() || cell.client_id,
        month_key: cell.month_key,
        amount: cell.amount,
      })
    }
  }
  return Array.from(map.values())
}

/**
 * Aggregate mark-billed snapshots to client × month.
 * Only rows with `billed === true` and a finite `billed_amount` contribute.
 */
export function aggregateBilledActualsToClientMonth(
  rows: ReadonlyArray<{
    clients_id: number | string
    client_name?: string | null
    billing_month: string
    billed?: boolean | null
    billed_amount?: number | null
  }>,
  fyBillingMonths: ReadonlySet<string>
): ClientMonthAmount[] {
  const map = new Map<string, ClientMonthAmount>()
  for (const row of rows) {
    if (row.billed !== true) continue
    if (typeof row.billed_amount !== "number" || !Number.isFinite(row.billed_amount)) continue
    if (!fyBillingMonths.has(row.billing_month)) continue
    const month_key = billingMonthToForecastMonthKey(row.billing_month)
    if (!month_key) continue
    const client_id = String(row.clients_id)
    const key = `${client_id}\u001f${month_key}`
    const prev = map.get(key)
    if (prev) {
      prev.amount += row.billed_amount
      if (row.client_name) prev.client_name = String(row.client_name)
    } else {
      map.set(key, {
        client_id,
        client_name: row.client_name?.trim() ? String(row.client_name) : client_id,
        month_key,
        amount: row.billed_amount,
      })
    }
  }
  return Array.from(map.values())
}

/** Booked reference: prefer `total_revenue` monthly; else sum all lines in the block. */
export function bookedMonthlyFromDataset(dataset: FinanceForecastDataset): ClientMonthAmount[] {
  const out: ClientMonthAmount[] = []
  for (const block of dataset.client_blocks) {
    let monthly = emptyMonthlyAmounts()
    let foundTotal = false
    for (const group of block.groups) {
      for (const line of group.lines) {
        if (line.line_key === FINANCE_FORECAST_LINE_KEYS.totalRevenue) {
          monthly = { ...line.monthly }
          foundTotal = true
          break
        }
      }
      if (foundTotal) break
    }
    if (!foundTotal) {
      for (const group of block.groups) {
        for (const line of group.lines) {
          for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
            monthly[k] += line.monthly[k] ?? 0
          }
        }
      }
    }
    for (const k of FINANCE_FORECAST_FISCAL_MONTH_ORDER) {
      const amount = monthly[k] ?? 0
      if (amount === 0) continue
      out.push({
        client_id: String(block.client_id),
        client_name: block.client_name,
        month_key: k,
        amount,
      })
    }
  }
  return out
}

export function buildTargetVsActualVariance(params: {
  financial_year_start_year: number
  targets: ClientMonthAmount[]
  actuals: ClientMonthAmount[]
  booked: ClientMonthAmount[]
}): TargetVsActualReport {
  const buckets = new Map<string, ClientBucket>()

  for (const t of params.targets) {
    const b = ensureBucket(buckets, t.client_id, t.client_name)
    b.target[t.month_key] += t.amount
  }
  for (const a of params.actuals) {
    const b = ensureBucket(buckets, a.client_id, a.client_name)
    b.actual[a.month_key] += a.amount
  }
  for (const bk of params.booked) {
    const b = ensureBucket(buckets, bk.client_id, bk.client_name)
    b.booked[bk.month_key] += bk.amount
  }

  const totalsTarget = emptyMonthlyAmounts()
  const totalsActual = emptyMonthlyAmounts()
  const totalsBooked = emptyMonthlyAmounts()

  const clients: TargetVsActualClientRow[] = Array.from(buckets.entries())
    .map(([client_id, b]) => {
      const months: TargetVsActualMonthAmounts[] = FINANCE_FORECAST_FISCAL_MONTH_ORDER.map((month_key) => {
        const target = b.target[month_key] ?? 0
        const actual = b.actual[month_key] ?? 0
        const booked = b.booked[month_key] ?? 0
        const { delta, delta_pct, rag } = measureDelta(target, actual)
        totalsTarget[month_key] += target
        totalsActual[month_key] += actual
        totalsBooked[month_key] += booked
        return { month_key, target, actual, booked, delta, delta_pct, rag }
      })

      const fyTarget = sumMonthly(b.target)
      const fyActual = sumMonthly(b.actual)
      const fyBooked = sumMonthly(b.booked)
      const fyCore = measureDelta(fyTarget, fyActual)

      return {
        client_id,
        client_name: b.client_name,
        months,
        fy: {
          target: fyTarget,
          actual: fyActual,
          booked: fyBooked,
          ...fyCore,
        },
      }
    })
    .sort((a, b) => a.client_name.localeCompare(b.client_name, undefined, { sensitivity: "base" }))

  const totalMonths: TargetVsActualMonthAmounts[] = FINANCE_FORECAST_FISCAL_MONTH_ORDER.map((month_key) => {
    const target = totalsTarget[month_key] ?? 0
    const actual = totalsActual[month_key] ?? 0
    const booked = totalsBooked[month_key] ?? 0
    return { month_key, target, actual, booked, ...measureDelta(target, actual) }
  })

  const fyTarget = sumMonthly(totalsTarget)
  const fyActual = sumMonthly(totalsActual)
  const fyBooked = sumMonthly(totalsBooked)

  return {
    financial_year_start_year: params.financial_year_start_year,
    actual_source: "finance_billing_records.billed_amount",
    actual_grain: "client_month",
    phase: 1,
    clients,
    totals: {
      months: totalMonths,
      target: fyTarget,
      actual: fyActual,
      booked: fyBooked,
      ...measureDelta(fyTarget, fyActual),
    },
  }
}
