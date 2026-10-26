/**
 * Finance production service rows (Luke, 22 Oct 2026, M3; 26 Oct 2026).
 *
 * The month's production goes under G.Production (Advertising Associates) or
 * D.Production (Assembled Media). When the plan has media under both codes,
 * production is split by each production line's own publisher instead of
 * writing the full amount under both codes. The rows always sum to the month
 * production.
 *
 * One rule, one place: `productionServiceRowsForMonth` is called by the hub
 * Excel (`/api/finance/data`) and by receivables derive
 * (`derivePlanReceivableBillingRecordsForMonth`), which feeds Send to
 * accounts, the Clients billing review download and the hub lists. Production
 * is billed once, from the month header (5d99899f).
 */

import type { FinanceServiceRow } from "@/lib/finance/utils"
import { calculateMonthlyAmountFromBursts, matchMonthYear } from "@/lib/finance/utils"
import { fromCents, toCents } from "@/lib/money"

export { PRODUCTION_ITEM_CODES, isProductionItemCode } from "@/lib/finance/productionItemCodes"

export type ProductionPlanLine = {
  lineItemId: string
  publisher: string | null
  bursts: unknown
}

export type ProductionLineMonthAmount = {
  lineItemId: string
  publisher: string | null
  amount: number
}

function scheduleMonths(billingSchedule: unknown): Record<string, unknown>[] {
  if (Array.isArray(billingSchedule)) return billingSchedule as Record<string, unknown>[]
  if (billingSchedule && typeof billingSchedule === "object") {
    const months = (billingSchedule as { months?: unknown }).months
    if (Array.isArray(months)) return months as Record<string, unknown>[]
  }
  return []
}

/** Per-line production on the billing blob month (`lineItems.production[].monthlyAmounts`). */
function blobProductionByLine(
  billingSchedule: unknown,
  year: number,
  month: number,
): Map<string, number> | null {
  const entry = scheduleMonths(billingSchedule).find((m) =>
    matchMonthYear(
      (m.monthYear ?? m.month_year ?? m.month ?? m.month_label) as string,
      year,
      month,
    ),
  )
  if (!entry) return null
  const label = String(entry.monthYear ?? entry.month_year ?? entry.month ?? "")
  const lineItems = entry.lineItems as { production?: unknown } | undefined
  const rows = lineItems?.production
  if (!Array.isArray(rows) || rows.length === 0) return null
  const out = new Map<string, number>()
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const r = row as { id?: unknown; monthlyAmounts?: Record<string, unknown> }
    const id = String(r.id ?? "").trim()
    if (!id) continue
    const amount = Number(r.monthlyAmounts?.[label] ?? 0)
    out.set(id, (out.get(id) ?? 0) + (Number.isFinite(amount) ? amount : 0))
  }
  return out
}

/**
 * Old (Xano-era) production bursts carry `cost` per unit and `amount` units
 * with no `budget`; CHALLEN003 cost 700 x amount 2 billed $1,400. Give those
 * bursts a budget of cost x amount so the month share reads the line total.
 */
function productionBurstsWithBudget(bursts: unknown): unknown {
  let list: unknown = bursts
  if (typeof list === "string") {
    try {
      list = JSON.parse(list)
    } catch {
      return bursts
    }
  }
  if (!Array.isArray(list)) return bursts
  return list.map((raw) => {
    if (!raw || typeof raw !== "object") return raw
    const burst = raw as Record<string, unknown>
    if (burst.budget != null && String(burst.budget).trim() !== "") return burst
    const cost = Number(burst.cost)
    const units = Number(burst.amount)
    if (!Number.isFinite(cost)) return burst
    const budget = Number.isFinite(units) && units > 0 ? cost * units : cost
    return { ...burst, budget }
  })
}

/**
 * This month's amount for each production line: the billing blob's per-line
 * production when present, else the line's bursts for the month.
 */
export function productionLineMonthAmounts(args: {
  billingSchedule: unknown
  year: number
  month: number
  lines: readonly ProductionPlanLine[]
}): ProductionLineMonthAmount[] {
  const fromBlob = blobProductionByLine(args.billingSchedule, args.year, args.month)
  return args.lines.map((line) => {
    const blobAmount = fromBlob?.get(line.lineItemId)
    const amount =
      blobAmount != null
        ? blobAmount
        : calculateMonthlyAmountFromBursts(
            productionBurstsWithBudget(line.bursts),
            args.year,
            args.month,
          )
    return { lineItemId: line.lineItemId, publisher: line.publisher, amount }
  })
}

/**
 * G./D. production rows for one campaign month.
 * - Media under one code only: the full production under that code (unchanged).
 * - Media under both codes, or no media at all (production-only month):
 *   production split by production publisher, in cents; D.Production takes
 *   the residue. With no usable production lines, the full production goes
 *   to D.Production (never both).
 */
export function buildProductionServiceRows(args: {
  production: number
  hasAdvertisingAssociates: boolean
  hasAssembledMedia: boolean
  lineAmounts: readonly ProductionLineMonthAmount[]
  billsViaAdvertisingAssociates: (publisher: string) => boolean
}): FinanceServiceRow[] {
  const { production, hasAdvertisingAssociates, hasAssembledMedia } = args
  const g = (amount: number): FinanceServiceRow => ({
    itemCode: "G.Production",
    service: "Production",
    amount,
  })
  const d = (amount: number): FinanceServiceRow => ({
    itemCode: "D.Production",
    service: "Production",
    amount,
  })
  if (hasAdvertisingAssociates && !hasAssembledMedia) return [g(production)]
  if (!hasAdvertisingAssociates && hasAssembledMedia) return [d(production)]

  let aaCents = 0
  let amCents = 0
  for (const line of args.lineAmounts) {
    const cents = toCents(line.amount)
    if (!(cents > 0)) continue
    const publisher = String(line.publisher ?? "").trim()
    if (publisher && args.billsViaAdvertisingAssociates(publisher)) aaCents += cents
    else amCents += cents
  }
  const totalCents = toCents(production)
  const weightCents = aaCents + amCents
  if (weightCents === 0) return [d(production)]
  if (amCents === 0) return [g(production)]
  if (aaCents === 0) return [d(production)]
  const gCents = Math.round((totalCents * aaCents) / weightCents)
  return [g(fromCents(gCents)), d(fromCents(totalCents - gCents))]
}

/** Production plan lines on the billing month itself (`lineItems.production`: id + header1 publisher). */
export function productionPlanLinesFromBillingMonth(
  billingSchedule: unknown,
  year: number,
  month: number,
): ProductionPlanLine[] {
  const entry = scheduleMonths(billingSchedule).find((m) =>
    matchMonthYear(
      (m.monthYear ?? m.month_year ?? m.month ?? m.month_label) as string,
      year,
      month,
    ),
  )
  const rows = (entry?.lineItems as { production?: unknown } | undefined)?.production
  if (!Array.isArray(rows)) return []
  const out: ProductionPlanLine[] = []
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const r = row as { id?: unknown; header1?: unknown }
    const id = String(r.id ?? "").trim()
    if (!id) continue
    const header = String(r.header1 ?? "").trim()
    // Blank publishers get the "Production" placeholder header (scheduleHeaders.ts).
    out.push({ lineItemId: id, publisher: header && header !== "Production" ? header : null, bursts: null })
  }
  return out
}

/**
 * The one production rule for every finance output (hub Excel, Send to
 * accounts, Clients billing review download). `mediaItemCodes` are the
 * month's media line item codes (G./D. prefix from `buildItemCode`). `lines`
 * are the version's production plan lines; per-line month amounts come from
 * the billing month's `lineItems.production`, else the line bursts.
 */
export function productionServiceRowsForMonth(args: {
  production: number
  mediaItemCodes: readonly string[]
  billingSchedule: unknown
  year: number
  month: number
  lines: readonly ProductionPlanLine[]
  billsViaAdvertisingAssociates: (publisher: string) => boolean
}): FinanceServiceRow[] {
  const hasAdvertisingAssociates = args.mediaItemCodes.some((c) => String(c).startsWith("G."))
  const hasAssembledMedia = args.mediaItemCodes.some((c) => String(c).startsWith("D."))
  const needsSplit = hasAdvertisingAssociates === hasAssembledMedia
  return buildProductionServiceRows({
    production: args.production,
    hasAdvertisingAssociates,
    hasAssembledMedia,
    lineAmounts: needsSplit
      ? productionLineMonthAmounts({
          billingSchedule: args.billingSchedule,
          year: args.year,
          month: args.month,
          lines: args.lines,
        })
      : [],
    billsViaAdvertisingAssociates: args.billsViaAdvertisingAssociates,
  })
}

/** Attached by `hydrateVersionsFinanceScheduleSource`: the version's production plan lines. */
export const FINANCE_PRODUCTION_LINES_KEY = "__financeProductionPlanLines" as const

export function attachFinanceProductionLines(
  version: Record<string, unknown>,
  lines: readonly ProductionPlanLine[],
): void {
  version[FINANCE_PRODUCTION_LINES_KEY] = [...lines]
}

/** Production plan lines attached by hydrate; null when hydrate did not attach them. */
export function getFinanceProductionLines(
  version: Record<string, unknown>,
): ProductionPlanLine[] | null {
  const raw = version[FINANCE_PRODUCTION_LINES_KEY]
  return Array.isArray(raw) ? (raw as ProductionPlanLine[]) : null
}
