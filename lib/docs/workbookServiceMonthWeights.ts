/**
 * Month cells for the media plan workbook Service Fee and Ad Serving rows.
 *
 * Published versions (DOC-1, Luke, 28 Oct 2026): the cells are the version's
 * BILLING schedule, read straight from `schedule_months` (basis billing,
 * components fee and adserving), so the Excel matches Finance to the cent.
 * See `serviceMonthAmountsFromBillingRows`.
 *
 * Fallback (drafts, which have no persisted rows, and versions with no
 * billing fee / ad serving rows): DELIVERY-month weights per line (Luke,
 * 22 Oct 2026). The weights only shape the split. The row totals always come
 * from the MBA totals, so the workbook totals do not change.
 */

import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { isoMonthToScheduleMonthYear } from "@/lib/finance/computeCampaignFinancials"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import { parseMoneyInput, roundMoney2 } from "@/lib/format/money"
import { fromCents } from "@/lib/money"

export type ServiceMonthWeights = {
  fee?: Record<string, number>
  adServing?: Record<string, number>
}

/** Exact dollars per schedule month label ("April 2026"), from integer cents. */
export type ServiceMonthAmounts = {
  fee?: Record<string, number>
  adServing?: Record<string, number>
}

/** One billing-basis `schedule_months` row (fee or adserving). */
export type BillingScheduleServiceRow = {
  lineItemId: string
  component: string
  /** YYYY-MM-01 (or YYYY-MM). */
  month: string
  amountCents: number
}

/**
 * DOC-1: Service Fee and Ad Serving month amounts from the version's billing
 * schedule rows, summed in integer cents per month. Line ids are compared bare
 * (MB-11). `__service__*` rows (plan-level fees) are always included. Lines the
 * MBA scope excludes are left out, and a partial scope keeps only its months.
 * A component with no non-zero month is omitted, so the caller falls back.
 */
export function serviceMonthAmountsFromBillingRows(args: {
  rows: readonly BillingScheduleServiceRow[]
  includeLine: (lineItemId: string) => boolean
  selectedMonthYears?: readonly string[] | null
}): ServiceMonthAmounts {
  const allowed =
    args.selectedMonthYears && args.selectedMonthYears.length > 0
      ? new Set(args.selectedMonthYears)
      : null
  const cents: Record<"fee" | "adServing", Record<string, number>> = { fee: {}, adServing: {} }
  for (const row of args.rows) {
    const component = String(row.component ?? "").trim().toLowerCase()
    const key = component === "fee" ? "fee" : component === "adserving" ? "adServing" : null
    if (!key) continue
    const id = toBillingOverrideLineItemId(String(row.lineItemId ?? "").trim())
    if (!id) continue
    if (!id.startsWith("__service__") && !args.includeLine(id)) continue
    const label = isoMonthToScheduleMonthYear(String(row.month ?? "").slice(0, 7))
    if (!label || (allowed && !allowed.has(label))) continue
    const amount = Math.trunc(Number(row.amountCents) || 0)
    if (amount === 0) continue
    cents[key][label] = (cents[key][label] ?? 0) + amount
  }
  const out: ServiceMonthAmounts = {}
  for (const key of ["fee", "adServing"] as const) {
    const months = Object.entries(cents[key]).filter(([, c]) => c !== 0)
    if (months.length === 0) continue
    out[key] = Object.fromEntries(months.map(([label, c]) => [label, fromCents(c)]))
  }
  return out
}

type ScheduleLine = { mediaKey: string; item: BillingLineItem }

/**
 * Distinct per-line rows on a schedule. Server schedules attach the same
 * lineItems map to every month (full monthly maps on each row), so each line
 * is read once.
 */
function distinctScheduleLines(schedule: readonly BillingMonth[]): ScheduleLine[] {
  const seen = new Set<string>()
  const out: ScheduleLine[] = []
  for (const month of schedule) {
    const lineItems = month?.lineItems
    if (!lineItems || typeof lineItems !== "object") continue
    for (const [mediaKey, items] of Object.entries(lineItems)) {
      if (!Array.isArray(items)) continue
      for (const item of items) {
        if (!item || typeof item !== "object") continue
        const key = `${mediaKey}|${String(item.id ?? "")}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ mediaKey, item })
      }
    }
  }
  return out
}

function addMonths(
  into: Record<string, number>,
  amounts: Record<string, number> | undefined,
  scale = 1,
): void {
  if (!amounts) return
  for (const [month, raw] of Object.entries(amounts)) {
    const amount = Number(raw)
    if (!Number.isFinite(amount) || amount === 0) continue
    into[month] = (into[month] ?? 0) + amount * scale
  }
}

function roundWeights(weights: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [month, value] of Object.entries(weights)) {
    if (value > 0) out[month] = roundMoney2(value)
  }
  return out
}

function hasPositive(weights: Record<string, number> | undefined): boolean {
  return Boolean(weights) && Object.values(weights!).some((v) => v > 0)
}

function restrictToMonths(
  weights: Record<string, number>,
  months: readonly string[] | null | undefined,
): Record<string, number> {
  if (!months || months.length === 0) return weights
  const allowed = new Set(months)
  const narrowed: Record<string, number> = {}
  for (const [month, value] of Object.entries(weights)) {
    if (allowed.has(month)) narrowed[month] = value
  }
  // A scope that leaves no delivery keeps the full delivery shape.
  return hasPositive(narrowed) ? narrowed : weights
}

/** Fee by delivery month: each included line's fee months on the delivery schedule. */
export function feeMonthWeightsFromDeliverySchedule(args: {
  deliverySchedule: readonly BillingMonth[]
  includeLine: (lineItemId: string) => boolean
  selectedMonthYears?: readonly string[] | null
}): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const { item } of distinctScheduleLines(args.deliverySchedule)) {
    if (!args.includeLine(String(item.id ?? ""))) continue
    addMonths(weights, item.feeMonthlyAmounts)
  }
  return roundWeights(restrictToMonths(weights, args.selectedMonthYears))
}

/**
 * Ad serving by delivery month.
 *
 * Without `targetDollarsByLine`, each included line's own ad serving months.
 * With it (published render: frozen per-line ad serving on `approved_slice`),
 * each line's delivery shape is scaled to that line's frozen amount. Ids match
 * bare or billing-prefixed (`billing-progVideo::X1`). Lines missing from the
 * map are left out.
 */
export function adServingMonthWeightsFromDeliverySchedule(args: {
  deliverySchedule: readonly BillingMonth[]
  includeLine: (lineItemId: string) => boolean
  targetDollarsByLine?: ReadonlyMap<string, number>
  selectedMonthYears?: readonly string[] | null
}): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const { item } of distinctScheduleLines(args.deliverySchedule)) {
    const id = String(item.id ?? "")
    if (!args.includeLine(id)) continue
    const months = item.adServingMonthlyAmounts
    if (!months) continue
    if (!args.targetDollarsByLine) {
      addMonths(weights, months)
      continue
    }
    const target = args.targetDollarsByLine.get(toBillingOverrideLineItemId(id))
    if (target == null || target <= 0) continue
    const shapeTotal = Object.values(months).reduce(
      (s, v) => s + (Number.isFinite(Number(v)) ? Number(v) : 0),
      0,
    )
    if (shapeTotal <= 0) continue
    addMonths(weights, months, target / shapeTotal)
  }
  return roundWeights(restrictToMonths(weights, args.selectedMonthYears))
}

/** Per-line ad serving dollars on a frozen approved slice (`adservingCents`), keyed by bare line id. */
export function adServingDollarsByLineFromApprovedSlice(
  slice: unknown,
): Map<string, number> | null {
  if (!slice || typeof slice !== "object") return null
  const lines = (slice as { lines?: unknown }).lines
  if (!Array.isArray(lines)) return null
  const out = new Map<string, number>()
  let sawField = false
  for (const line of lines) {
    if (!line || typeof line !== "object") continue
    const record = line as {
      lineItemId?: unknown
      line_item_id?: unknown
      adservingCents?: unknown
      adserving_cents?: unknown
    }
    if (!("adservingCents" in record) && !("adserving_cents" in record)) continue
    sawField = true
    const id = toBillingOverrideLineItemId(String(record.lineItemId ?? record.line_item_id ?? ""))
    const cents = Math.trunc(Number(record.adservingCents ?? record.adserving_cents) || 0)
    if (!id || cents <= 0) continue
    out.set(id, (out.get(id) ?? 0) + cents / 100)
  }
  return sawField ? out : null
}

/**
 * Month header totals on a stored schedule blob (legacy fallback when the
 * version has no per-line fee basis). `feeTotal` / `adservingTechFees` strings.
 */
export function monthTotalsFromStoredSchedule(
  schedule: unknown,
  field: "feeTotal" | "adservingTechFees",
): Record<string, number> {
  const out: Record<string, number> = {}
  let rows: unknown = schedule
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows)
    } catch {
      return out
    }
  }
  if (rows && typeof rows === "object" && !Array.isArray(rows)) {
    const months = (rows as { months?: unknown }).months
    rows = Array.isArray(months) ? months : null
  }
  if (!Array.isArray(rows)) return out
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const record = row as Record<string, unknown>
    const month = String(record.monthYear ?? "").trim()
    if (!month) continue
    const value = roundMoney2(parseMoneyInput(record[field] as string | number | undefined) ?? 0)
    if (value > 0) out[month] = roundMoney2((out[month] ?? 0) + value)
  }
  return out
}

/** First weight map with a positive month, else undefined (workbook falls back to media share). */
export function firstUsableWeights(
  ...candidates: Array<Record<string, number> | null | undefined>
): Record<string, number> | undefined {
  for (const candidate of candidates) {
    if (hasPositive(candidate ?? undefined)) return candidate!
  }
  return undefined
}
