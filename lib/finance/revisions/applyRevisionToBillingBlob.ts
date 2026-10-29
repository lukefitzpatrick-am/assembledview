/**
 * Rebuild legacy_schedules.billingSchedule from billing revision cells
 * (design 5.3 step 4). Pure.
 *
 * Only the BillingMonth[] shape (monthYear + lineItems + header strings) is
 * supported. Anything else is refused, never guessed.
 *
 * - Changed lines get monthlyAmounts (media) and feeMonthlyAmounts (fee) set
 *   for every month row's copy of the line, totals recomputed, and the mode
 *   stamped manual.
 * - A month the blob lacks is added (prebill), with zero headers.
 * - Headers are recomputed only for months whose cells changed. feeTotal,
 *   production and adservingTechFees move by the change in the line sums, so
 *   a fixed header fee or header-only production stays as it was.
 * - Ad serving (adServingMonthlyAmounts) changes only for the true-up kinds;
 *   the other kinds never send it.
 * - __service__* synthetic rows are never touched.
 *
 * The writer checks the round trip: explodeScheduleToMonthRows(result)
 * must equal the planned billing rows to the cent.
 */

import { billingOverrideLineIdsMatch } from "@/lib/finance/manualBillingOverridesUi"
import { parseMoney, toCents } from "@/lib/money"

import type { Cents, MonthKey } from "./types"

export type BlobRevisionCells = Array<{
  lineItemId: string
  media: Record<MonthKey, Cents>
  fee: Record<MonthKey, Cents>
  mediaChanged: boolean
  feeChanged: boolean
  adserving?: Record<MonthKey, Cents>
  adservingChanged?: boolean
}>

type BlobLine = {
  id?: unknown
  monthlyAmounts?: Record<string, number>
  feeMonthlyAmounts?: Record<string, number>
  totalAmount?: number
  mediaAmount?: number
  totalFeeAmount?: number
  feeAmount?: number
  billingMode?: string
  feeBillingMode?: string
  adServingMonthlyAmounts?: Record<string, number>
  totalAdServingAmount?: number
  [k: string]: unknown
}

type BlobMonth = {
  monthYear: string
  lineItems?: Record<string, BlobLine[]>
  mediaCosts?: Record<string, string>
  mediaTotal?: string
  feeTotal?: string
  totalAmount?: string
  adservingTechFees?: string
  production?: string
  [k: string]: unknown
}

export type ApplyRevisionToBlobResult =
  | { ok: true; blob: BlobMonth[]; addedMonths: MonthKey[] }
  | { ok: false; code: "BLOB_SHAPE_UNSUPPORTED" | "LINE_NOT_IN_BLOB" | "BAD_MONTH"; message: string }

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function monthKeyToScheduleLabel(month: MonthKey): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return null
  const idx = Number(m[2]) - 1
  if (idx < 0 || idx > 11) return null
  return `${MONTH_NAMES[idx]} ${m[1]}`
}

export function scheduleLabelToMonthKey(label: string): MonthKey | null {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(String(label ?? "").trim())
  if (!m) return null
  const idx = MONTH_NAMES.findIndex((n) => n.toLowerCase() === m[1]!.toLowerCase())
  if (idx < 0) return null
  return `${m[2]}-${String(idx + 1).padStart(2, "0")}`
}

/** Cents of a blob cell (number or numeric string); non-finite reads as 0. */
function cellCents(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? toCents(n) : 0
}

/** Cents of a month header string ("$1,234.56"); unreadable reads as 0. */
function headerCents(value: unknown): number {
  return toCents(parseMoney(value) ?? 0)
}

function dollars(cents: number): number {
  return Math.round(cents) / 100
}

function sumDollars(rec: Record<string, number> | undefined): number {
  if (!rec) return 0
  let cents = 0
  for (const v of Object.values(rec)) cents += cellCents(v)
  return dollars(cents)
}

function isBlobMonthArray(raw: unknown): raw is BlobMonth[] {
  return (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.every(
      (m) =>
        m != null &&
        typeof m === "object" &&
        typeof (m as BlobMonth).monthYear === "string" &&
        scheduleLabelToMonthKey((m as BlobMonth).monthYear) != null &&
        ((m as BlobMonth).lineItems == null || typeof (m as BlobMonth).lineItems === "object"),
    )
  )
}

function emptyMonth(label: string, template: BlobMonth): BlobMonth {
  const mediaCosts: Record<string, string> = {}
  for (const k of Object.keys(template.mediaCosts ?? {})) mediaCosts[k] = currency.format(0)
  const lineItems = JSON.parse(JSON.stringify(template.lineItems ?? {})) as Record<string, BlobLine[]>
  return {
    feeTotal: currency.format(0),
    lineItems,
    monthYear: label,
    mediaCosts,
    mediaTotal: currency.format(0),
    production: currency.format(0),
    totalAmount: currency.format(0),
    adservingTechFees: currency.format(0),
  }
}

/** Lines in a month row, flattened with their media key. */
function linesOf(month: BlobMonth): Array<{ key: string; line: BlobLine }> {
  const out: Array<{ key: string; line: BlobLine }> = []
  for (const [key, items] of Object.entries(month.lineItems ?? {})) {
    if (!Array.isArray(items)) continue
    for (const line of items) out.push({ key, line })
  }
  return out
}

type MonthSums = { productionCents: number; feeCents: number; adservingCents: number }

function lineMonthSums(month: BlobMonth): MonthSums {
  let productionCents = 0
  let feeCents = 0
  let adservingCents = 0
  for (const { key, line } of linesOf(month)) {
    if (key === "production") productionCents += cellCents(line.monthlyAmounts?.[month.monthYear])
    feeCents += cellCents(line.feeMonthlyAmounts?.[month.monthYear])
    adservingCents += cellCents(line.adServingMonthlyAmounts?.[month.monthYear])
  }
  return { productionCents, feeCents, adservingCents }
}

function recalcMonthHeaders(month: BlobMonth, before: MonthSums): void {
  const after = lineMonthSums(month)
  const fee = headerCents(month.feeTotal) + (after.feeCents - before.feeCents)
  const production = headerCents(month.production) + (after.productionCents - before.productionCents)
  const adserv = headerCents(month.adservingTechFees) + (after.adservingCents - before.adservingCents)
  let mediaCents = 0
  const byKey = new Map<string, number>()
  for (const { key, line } of linesOf(month)) {
    const c = cellCents(line.monthlyAmounts?.[month.monthYear])
    byKey.set(key, (byKey.get(key) ?? 0) + c)
    if (key !== "production") mediaCents += c
  }
  if (month.mediaCosts) {
    for (const [key, c] of byKey) {
      if (key in month.mediaCosts) month.mediaCosts[key] = currency.format(dollars(c))
    }
    if ("production" in month.mediaCosts) month.mediaCosts.production = currency.format(dollars(production))
  }
  month.feeTotal = currency.format(dollars(fee))
  month.production = currency.format(dollars(production))
  // Only the true-up kinds move line ad serving; the header string stays as it was otherwise.
  if (after.adservingCents !== before.adservingCents) month.adservingTechFees = currency.format(dollars(adserv))
  month.mediaTotal = currency.format(dollars(mediaCents))
  month.totalAmount = currency.format(dollars(mediaCents + fee + adserv + production))
}

export function applyRevisionToBillingBlob(raw: unknown, cells: BlobRevisionCells): ApplyRevisionToBlobResult {
  if (!isBlobMonthArray(raw)) {
    return {
      ok: false,
      code: "BLOB_SHAPE_UNSUPPORTED",
      message: "The billing schedule on this version is not in the month-row format. Republish it from the editor first.",
    }
  }
  const months = JSON.parse(JSON.stringify(raw)) as BlobMonth[]

  // Months the cells need, by key.
  const needed = new Set<MonthKey>()
  for (const c of cells) {
    for (const [m, v] of [...Object.entries(c.media), ...Object.entries(c.fee), ...Object.entries(c.adserving ?? {})]) {
      if (!monthKeyToScheduleLabel(m)) return { ok: false, code: "BAD_MONTH", message: `Bad month ${m}` }
      if (v !== 0) needed.add(m)
    }
  }
  const present = new Set(months.map((m) => scheduleLabelToMonthKey(m.monthYear)!))
  const addedMonths: MonthKey[] = []
  for (const m of [...needed].sort()) {
    if (present.has(m)) continue
    months.push(emptyMonth(monthKeyToScheduleLabel(m)!, months[0]!))
    present.add(m)
    addedMonths.push(m)
  }
  months.sort((a, b) => scheduleLabelToMonthKey(a.monthYear)!.localeCompare(scheduleLabelToMonthKey(b.monthYear)!))
  const labels = months.map((m) => m.monthYear)

  const touched = new Set<number>()

  for (const c of cells) {
    if (!c.mediaChanged && !c.feeChanged && !c.adservingChanged) continue
    let found = false
    months.forEach((month) => {
      for (const { line } of linesOf(month)) {
        // Blob ids may be bare or `billing-{media}::bare` (MB-4).
        if (!billingOverrideLineIdsMatch(String(line.id ?? ""), c.lineItemId)) continue
        found = true
        if (c.mediaChanged) {
          const monthly: Record<string, number> = { ...(line.monthlyAmounts ?? {}) }
          for (const label of labels) {
            const key = scheduleLabelToMonthKey(label)!
            monthly[label] = dollars(c.media[key] ?? 0)
          }
          line.monthlyAmounts = monthly
          const total = sumDollars(monthly)
          line.totalAmount = total
          if (typeof line.mediaAmount === "number") line.mediaAmount = total
          line.billingMode = "manual"
        } else {
          // Keep keys aligned for any added month.
          const monthly: Record<string, number> = { ...(line.monthlyAmounts ?? {}) }
          for (const label of labels) if (!(label in monthly)) monthly[label] = 0
          line.monthlyAmounts = monthly
        }
        if (c.feeChanged) {
          const fee: Record<string, number> = { ...(line.feeMonthlyAmounts ?? {}) }
          for (const label of labels) {
            const key = scheduleLabelToMonthKey(label)!
            fee[label] = dollars(c.fee[key] ?? 0)
          }
          line.feeMonthlyAmounts = fee
          const total = sumDollars(fee)
          line.totalFeeAmount = total
          if (typeof line.feeAmount === "number") line.feeAmount = total
          line.feeBillingMode = "manual"
        }
        if (c.adservingChanged) {
          const ad: Record<string, number> = { ...(line.adServingMonthlyAmounts ?? {}) }
          for (const label of labels) {
            const key = scheduleLabelToMonthKey(label)!
            ad[label] = dollars(c.adserving?.[key] ?? 0)
          }
          line.adServingMonthlyAmounts = ad
          line.totalAdServingAmount = sumDollars(ad)
        }
      }
    })
    if (!found) {
      return {
        ok: false,
        code: "LINE_NOT_IN_BLOB",
        message: `${c.lineItemId} is in schedule_months but not in the billing schedule blob.`,
      }
    }
  }

  // Added months: every line copy needs the new label key (zero unless set).
  if (addedMonths.length > 0) {
    for (const month of months) {
      for (const { line } of linesOf(month)) {
        for (const label of labels) {
          if (line.monthlyAmounts && !(label in line.monthlyAmounts)) line.monthlyAmounts[label] = 0
          if (line.feeMonthlyAmounts && !(label in line.feeMonthlyAmounts)) line.feeMonthlyAmounts[label] = 0
          if (line.adServingMonthlyAmounts && !(label in line.adServingMonthlyAmounts)) {
            line.adServingMonthlyAmounts[label] = 0
          }
        }
      }
    }
  }

  // Months whose line cells changed (or were added) get new headers.
  for (const m of addedMonths) {
    const i = months.findIndex((x) => scheduleLabelToMonthKey(x.monthYear) === m)
    if (i >= 0) touched.add(i)
  }
  const rawMonths = raw as BlobMonth[]
  months.forEach((month, i) => {
    const orig = rawMonths.find((m) => m.monthYear === month.monthYear)
    if (!orig) return
    const a = linesOf(orig).map(
      ({ line }) =>
        `${line.id}:${line.monthlyAmounts?.[orig.monthYear] ?? 0}:${line.feeMonthlyAmounts?.[orig.monthYear] ?? 0}:${line.adServingMonthlyAmounts?.[orig.monthYear] ?? 0}`,
    )
    const b = linesOf(month).map(
      ({ line }) =>
        `${line.id}:${line.monthlyAmounts?.[month.monthYear] ?? 0}:${line.feeMonthlyAmounts?.[month.monthYear] ?? 0}:${line.adServingMonthlyAmounts?.[month.monthYear] ?? 0}`,
    )
    if (a.join("|") !== b.join("|")) touched.add(i)
  })

  for (const i of touched) {
    const month = months[i]!
    const orig = rawMonths.find((m) => m.monthYear === month.monthYear)
    recalcMonthHeaders(month, orig ? lineMonthSums(orig) : { productionCents: 0, feeCents: 0, adservingCents: 0 })
  }

  return { ok: true, blob: months, addedMonths }
}
