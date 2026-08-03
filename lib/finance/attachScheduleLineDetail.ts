/**
 * Attach per-line `BillingMonth.lineItems` to server-computed schedules.
 *
 * Fee month maps reuse {@link prorateBurstFeesToMonths} — the same
 * `prorateAcrossMonths(burst.feeAmount)` allocation that
 * `computeBillingAndDeliveryMonths` rolls into month `feeTotal`.
 * Manual fee overrides use the line's `feeBillingMonths` (billing basis only).
 */

import { computeAdServingCost } from "@/lib/billing/computeAdServingCost"
import { prorateAcrossMonths } from "@/lib/billing/prorateAcrossMonths"
import { prorateBurstFeesToMonths } from "@/lib/billing/seedLineFees"
import type { BillingBurst, BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { parseMoneyInput, roundMoney2 } from "@/lib/format/money"
import type {
  BillingOverride,
  FeeOverride,
  MonthAmount,
} from "@/lib/finance/campaignFinancials.types"

/** Cent-level tolerance for header ↔ lineItems sum invariant. */
export const SCHEDULE_LINE_DETAIL_TOLERANCE = 0.01

const AD_SERVING_MEDIA_TYPES = new Set([
  "digiAudio",
  "digiDisplay",
  "digiVideo",
  "bvod",
  "progAudio",
  "progVideo",
  "progBvod",
  "progOoh",
  "progDisplay",
])

export type ScheduleLineDetailSource = {
  lineItemId: string
  scheduleMediaType: string
  buyType: string
  clientPaysForMedia: boolean
  excluded: boolean
  label?: string
  billingMonths: MonthAmount[]
  deliveryMonths: MonthAmount[]
  /** Populated when feeOverride is manual; schedule monthYear keys. */
  feeBillingMonths: MonthAmount[]
  bursts: BillingBurst[]
  billingOverride?: BillingOverride
  feeOverride?: FeeOverride
}

export type AttachScheduleLineDetailOpts = {
  getRateForMediaType?: (mediaType: string) => number
  adservaudio?: number
  /**
   * When true (or env `PLANC_LINE_DETAIL_ASSERT=1`), throw on header/line drift.
   * Otherwise log loudly and leave the schedule attached.
   */
  assertInvariant?: boolean
}

function parseMonthMoney(value: string | undefined): number {
  return roundMoney2(parseMoneyInput(value ?? 0) ?? 0)
}

function monthAmountsToRecord(
  amounts: MonthAmount[],
  monthKeys: string[]
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of monthKeys) out[key] = 0
  for (const { month, amount } of amounts) {
    if (!(month in out)) out[month] = 0
    out[month] = roundMoney2((out[month] ?? 0) + amount)
  }
  return out
}

function autoFeeMonthlyAmounts(
  bursts: BillingBurst[],
  monthKeys: string[]
): Record<string, number> {
  const { feeMonthlyAmounts } = prorateBurstFeesToMonths(
    bursts.map((b) => ({
      startDate: b.startDate,
      endDate: b.endDate,
      feeAmount: b.feeAmount,
      clientPaysForMedia: b.clientPaysForMedia,
    })),
    monthKeys
  )
  const out: Record<string, number> = {}
  for (const key of monthKeys) {
    out[key] = roundMoney2(feeMonthlyAmounts[key] ?? 0)
  }
  return out
}

function adServingMonthlyAmountsForLine(
  line: ScheduleLineDetailSource,
  monthKeys: string[],
  opts: AttachScheduleLineDetailOpts
): Record<string, number> | undefined {
  if (!AD_SERVING_MEDIA_TYPES.has(line.scheduleMediaType)) return undefined

  const getRate = opts.getRateForMediaType ?? (() => 0)
  const adservaudio = opts.adservaudio ?? 0
  const out: Record<string, number> = {}
  for (const key of monthKeys) out[key] = 0

  for (const burst of line.bursts) {
    if (burst.noAdserving) continue
    const deliverables = Number(burst.deliverables || 0)
    if (deliverables <= 0) continue

    const cost = computeAdServingCost({
      quantity: deliverables,
      buyType: burst.buyType || line.buyType || "",
      mediaType: line.scheduleMediaType,
      rate: getRate(line.scheduleMediaType),
      adservaudio,
      adServingRatePct: burst.adServingRatePct,
      adServingImpressions: burst.adServingImpressions,
    })
    if (cost <= 0) continue

    const shares = prorateAcrossMonths({
      amount: cost,
      burstStart: burst.startDate,
      burstEnd: burst.endDate,
      monthKeys,
    })
    for (const key of monthKeys) {
      out[key] = roundMoney2((out[key] ?? 0) + (shares[key] ?? 0))
    }
  }

  return out
}

function buildBillingLineItem(
  line: ScheduleLineDetailSource,
  basis: "billing" | "delivery",
  monthKeys: string[],
  opts: AttachScheduleLineDetailOpts
): BillingLineItem {
  const mediaMonths =
    basis === "billing" ? line.billingMonths : line.deliveryMonths
  const monthlyAmounts = monthAmountsToRecord(mediaMonths, monthKeys)

  const useFeeOverride =
    basis === "billing" &&
    line.feeOverride?.mode === "manual" &&
    line.feeBillingMonths.length > 0

  const feeMonthlyAmounts = useFeeOverride
    ? monthAmountsToRecord(line.feeBillingMonths, monthKeys)
    : autoFeeMonthlyAmounts(line.bursts, monthKeys)

  const totalAmount = roundMoney2(
    Object.values(monthlyAmounts).reduce((s, v) => s + v, 0)
  )
  const totalFeeAmount = roundMoney2(
    Object.values(feeMonthlyAmounts).reduce((s, v) => s + v, 0)
  )

  const adServingMonthlyAmounts = adServingMonthlyAmountsForLine(
    line,
    monthKeys,
    opts
  )
  const totalAdServingAmount = adServingMonthlyAmounts
    ? roundMoney2(
        Object.values(adServingMonthlyAmounts).reduce((s, v) => s + v, 0)
      )
    : undefined

  // MB-12: override metadata is billing-basis only. Delivery amounts stay auto;
  // stamping manual/preBill on delivery lied after MB-1 attached overrides to financials.
  const billingMode: BillingLineItem["billingMode"] =
    basis === "billing" && line.billingOverride?.mode === "manual"
      ? "manual"
      : "auto"
  const feeBillingMode: BillingLineItem["feeBillingMode"] =
    basis === "billing" && line.feeOverride?.mode === "manual"
      ? "manual"
      : "auto"
  const preBill =
    basis === "billing" && line.billingOverride?.reason === "prepayment"

  const label = String(line.label ?? "").trim()
  const header1 = label || line.scheduleMediaType || "Item"
  const header2 = label ? "" : line.lineItemId

  const item: BillingLineItem = {
    id: line.lineItemId,
    header1,
    header2,
    monthlyAmounts,
    totalAmount,
    billingMode,
    feeBillingMode,
    mediaType: line.scheduleMediaType,
    buyType: line.buyType || undefined,
    mediaAmount: totalAmount,
    feeAmount: totalFeeAmount,
    feeMonthlyAmounts,
    totalFeeAmount,
    ...(line.clientPaysForMedia ? { clientPaysForMedia: true } : {}),
    ...(preBill ? { preBill: true } : {}),
    ...(adServingMonthlyAmounts
      ? { adServingMonthlyAmounts, totalAdServingAmount }
      : {}),
  }
  return item
}

function groupLineItems(
  lines: ScheduleLineDetailSource[],
  basis: "billing" | "delivery",
  monthKeys: string[],
  opts: AttachScheduleLineDetailOpts
): NonNullable<BillingMonth["lineItems"]> {
  const groups: Record<string, BillingLineItem[]> = {}

  for (const line of lines) {
    // Billing schedule excludes approval-excluded lines (matches approved burst set).
    // Delivery keeps them — computeBillingAndDeliveryMonths uses allLinesForDelivery.
    if (basis === "billing" && line.excluded) continue

    const item = buildBillingLineItem(line, basis, monthKeys, opts)
    const hasMedia = Object.values(item.monthlyAmounts).some((v) => Math.abs(v) > 1e-9)
    const hasFee = Object.values(item.feeMonthlyAmounts ?? {}).some(
      (v) => Math.abs(v) > 1e-9
    )
    const hasAd =
      item.adServingMonthlyAmounts != null &&
      Object.values(item.adServingMonthlyAmounts).some((v) => Math.abs(v) > 1e-9)
    // Keep client-pays fee-only rows (media 0) and override fee rows.
    if (!hasMedia && !hasFee && !hasAd) continue

    const key = line.scheduleMediaType
    if (!groups[key]) groups[key] = []
    groups[key]!.push(item)
  }

  return groups as NonNullable<BillingMonth["lineItems"]>
}

export type ScheduleLineDetailInvariantViolation = {
  monthYear: string
  field: "media" | "fee"
  headerTotal: number
  lineItemsSum: number
  delta: number
}

/**
 * For every month: non-production line media months sum to mediaTotal;
 * all line fee months sum to feeTotal (within {@link SCHEDULE_LINE_DETAIL_TOLERANCE}).
 * Production media lives in `production`, not `mediaTotal` — excluded from media sum.
 */
export function collectScheduleLineDetailViolations(
  months: BillingMonth[]
): ScheduleLineDetailInvariantViolation[] {
  const violations: ScheduleLineDetailInvariantViolation[] = []

  for (const month of months) {
    const lineItems = month.lineItems
    if (!lineItems) continue

    let mediaSum = 0
    let feeSum = 0
    for (const [mediaKey, items] of Object.entries(lineItems)) {
      if (!Array.isArray(items)) continue
      for (const li of items) {
        if (mediaKey !== "production") {
          mediaSum += Number(li.monthlyAmounts?.[month.monthYear] ?? 0) || 0
        }
        feeSum += Number(li.feeMonthlyAmounts?.[month.monthYear] ?? 0) || 0
      }
    }
    mediaSum = roundMoney2(mediaSum)
    feeSum = roundMoney2(feeSum)

    const headerMedia = parseMonthMoney(month.mediaTotal)
    const headerFee = parseMonthMoney(month.feeTotal)

    if (Math.abs(mediaSum - headerMedia) > SCHEDULE_LINE_DETAIL_TOLERANCE) {
      violations.push({
        monthYear: month.monthYear,
        field: "media",
        headerTotal: headerMedia,
        lineItemsSum: mediaSum,
        delta: roundMoney2(mediaSum - headerMedia),
      })
    }
    if (Math.abs(feeSum - headerFee) > SCHEDULE_LINE_DETAIL_TOLERANCE) {
      violations.push({
        monthYear: month.monthYear,
        field: "fee",
        headerTotal: headerFee,
        lineItemsSum: feeSum,
        delta: roundMoney2(feeSum - headerFee),
      })
    }
  }

  return violations
}

export function assertScheduleLineItemsMatchMonthTotals(
  months: BillingMonth[],
  label = "schedule"
): void {
  const violations = collectScheduleLineDetailViolations(months)
  if (violations.length === 0) return
  const detail = violations
    .map(
      (v) =>
        `${v.monthYear} ${v.field}: lines=${v.lineItemsSum} header=${v.headerTotal} delta=${v.delta}`
    )
    .join("; ")
  throw new Error(
    `[Plan-C line detail] ${label} header/lineItems drift: ${detail}`
  )
}

function shouldAssertInvariant(opts: AttachScheduleLineDetailOpts): boolean {
  if (opts.assertInvariant === true) return true
  if (opts.assertInvariant === false) return false
  const flag = String(process.env.PLANC_LINE_DETAIL_ASSERT ?? "")
    .trim()
    .toLowerCase()
  return flag === "1" || flag === "true" || flag === "yes"
}

/**
 * Clone months and attach a shared per-channel lineItems map (full monthly maps
 * on each BillingLineItem — same shape the editor persists).
 */
export function attachScheduleLineDetail(
  months: BillingMonth[],
  lines: ScheduleLineDetailSource[],
  basis: "billing" | "delivery",
  opts: AttachScheduleLineDetailOpts = {}
): BillingMonth[] {
  if (!months.length) return months

  const monthKeys = months.map((m) => m.monthYear)
  const grouped = groupLineItems(lines, basis, monthKeys, opts)
  const hasAny = Object.values(grouped).some((arr) => arr && arr.length > 0)

  const next = months.map((m) => ({
    ...m,
    mediaCosts: { ...m.mediaCosts },
    ...(hasAny ? { lineItems: grouped } : {}),
  }))

  const violations = collectScheduleLineDetailViolations(next)
  if (violations.length > 0) {
    const detail = violations
      .map(
        (v) =>
          `${v.monthYear}/${v.field} lines=${v.lineItemsSum} header=${v.headerTotal} Δ=${v.delta}`
      )
      .join("; ")
    const msg = `[Plan-C line detail] ${basis} schedule header/lineItems drift: ${detail}`
    if (shouldAssertInvariant(opts)) {
      throw new Error(msg)
    }
    console.error(msg)
  }

  return next
}
