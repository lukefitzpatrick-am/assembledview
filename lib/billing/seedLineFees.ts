import { getScheduleHeaders } from "@/lib/billing/scheduleHeaders"
import { prorateAcrossMonths } from "@/lib/billing/prorateAcrossMonths"
import type { BillingBurst, BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { resolveLineDimensions } from "@/lib/finance/resolveLineDimensions"

export type SeedBurstSource = {
  startDate: Date | string
  endDate: Date | string
  feeAmount: number
  clientPaysForMedia?: boolean
}

export type SeedLineFeesMediaConfig = {
  billingKey: string
  lineItems: any[]
  /** Flattened container bursts (same order as lineItems.flatMap(bursts)). */
  containerBursts: BillingBurst[]
}

export type SeedLineFeesOptions = {
  mode?: "billing" | "delivery"
}

/** Match billing divergence / currency rounding tolerance. */
export const FEE_SEED_TOLERANCE = 0.01

function parseMoney(v: unknown): number {
  return parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0
}

export function feeAmountsMatch(stored: number | undefined, derived: number): boolean {
  if (stored === undefined) return false
  return Math.abs(stored - derived) <= FEE_SEED_TOLERANCE
}

export function parseLineItemBursts(lineItem: any): any[] {
  if (typeof lineItem?.bursts_json === "string") {
    try {
      return JSON.parse(lineItem.bursts_json)
    } catch {
      return []
    }
  }
  if (Array.isArray(lineItem?.bursts_json)) return lineItem.bursts_json
  if (Array.isArray(lineItem?.bursts)) return lineItem.bursts
  return []
}

function lineClientPaysForMedia(
  sourceLine: any,
  billingLine?: BillingLineItem
): boolean {
  return Boolean(
    sourceLine?.client_pays_for_media ??
      sourceLine?.clientPaysForMedia ??
      billingLine?.clientPaysForMedia
  )
}

function burstSourcesHavePositiveFee(sources: SeedBurstSource[]): boolean {
  return sources.some((b) => b.feeAmount > 0)
}

/** Slice flat container bursts for one line item (containers flatMap line items in order). */
export function sliceContainerBurstsForLineItem(
  lineItems: any[],
  lineIndex: number,
  containerBursts: BillingBurst[]
): BillingBurst[] {
  let offset = 0
  for (let i = 0; i < lineIndex; i++) {
    offset += parseLineItemBursts(lineItems[i]).length
  }
  const count = parseLineItemBursts(lineItems[lineIndex]).length
  return containerBursts.slice(offset, offset + count)
}

export function burstsForLineItem(
  lineItem: any,
  lineIndex: number,
  lineItems: any[],
  containerBursts: BillingBurst[]
): SeedBurstSource[] {
  const jsonBursts = parseLineItemBursts(lineItem)
  const containerSlice = sliceContainerBurstsForLineItem(lineItems, lineIndex, containerBursts)

  return jsonBursts.map((jb, bi) => {
    const cb = containerSlice[bi]
    const feeAmount =
      cb != null && Number.isFinite(cb.feeAmount)
        ? cb.feeAmount
        : parseMoney(jb?.feeAmount ?? jb?.fee)
    const clientPaysForMedia = Boolean(
      cb?.clientPaysForMedia ??
        jb?.clientPaysForMedia ??
        jb?.client_pays_for_media ??
        lineItem?.client_pays_for_media ??
        lineItem?.clientPaysForMedia
    )
    return {
      startDate: cb?.startDate ?? jb?.startDate ?? jb?.start_date,
      endDate: cb?.endDate ?? jb?.endDate ?? jb?.end_date,
      feeAmount,
      clientPaysForMedia,
    }
  })
}

/**
 * Prorate burst fee amounts across billing months (day-overlap; same shape as edit-page fee loop).
 * `client_pays_for_media` does not affect fees — agency fee is always prorated from `burst.feeAmount`.
 */
export function prorateBurstFeesToMonths(
  bursts: SeedBurstSource[],
  monthKeys: string[]
): { feeMonthlyAmounts: Record<string, number>; totalFeeAmount: number } {
  const feeMonthlyAmounts: Record<string, number> = {}
  monthKeys.forEach((key) => {
    feeMonthlyAmounts[key] = 0
  })

  for (const burst of bursts) {
    const feeForBurst = burst.feeAmount
    if (feeForBurst <= 0) continue

    const shares = prorateAcrossMonths({
      amount: feeForBurst,
      burstStart: burst.startDate,
      burstEnd: burst.endDate,
      monthKeys,
    })
    for (const monthKey of monthKeys) {
      feeMonthlyAmounts[monthKey] += shares[monthKey] ?? 0
    }
  }

  const totalFeeAmount = Object.values(feeMonthlyAmounts).reduce((sum, val) => sum + val, 0)
  return { feeMonthlyAmounts, totalFeeAmount }
}

function createSyntheticBillingLine(
  id: string,
  billingKey: string,
  sourceLine: any,
  monthKeys: string[],
  clientPaysForMedia: boolean
): BillingLineItem {
  const { header1, header2 } = getScheduleHeaders(billingKey, sourceLine)
  const dimensions = resolveLineDimensions(billingKey, sourceLine)
  const monthlyAmounts: Record<string, number> = {}
  for (const key of monthKeys) {
    monthlyAmounts[key] = 0
  }
  return {
    id,
    header1: header1 || "Item",
    header2: header2 || "Details",
    monthlyAmounts,
    totalAmount: 0,
    ...dimensions,
    ...(clientPaysForMedia ? { clientPaysForMedia: true } : {}),
  }
}

function needsReportDimensionHeal(
  billingLine: BillingLineItem,
  dimensions: ReturnType<typeof resolveLineDimensions>,
  clientPaysForMedia: boolean
): boolean {
  return (
    billingLine.mediaType !== dimensions.mediaType ||
    (dimensions.publisher !== undefined && billingLine.publisher !== dimensions.publisher) ||
    (dimensions.buyType !== undefined && billingLine.buyType !== dimensions.buyType) ||
    (dimensions.format !== undefined && billingLine.format !== dimensions.format) ||
    (dimensions.station !== undefined && billingLine.station !== dimensions.station) ||
    (clientPaysForMedia && billingLine.clientPaysForMedia !== true)
  )
}

/**
 * Ensure every media line with billable burst fees exists on month[0] lineItems (and all months).
 * Client-pays lines are often omitted from persisted billingSchedule ($0 media filter).
 */
function injectMissingFeeLinesFromMedia(
  months: BillingMonth[],
  billingKey: string,
  lineItems: any[],
  monthKeys: string[],
  stableLineItemId: (mediaKey: string, lineItem: any, index: number) => string,
  containerBursts: BillingBurst[]
): number {
  const first = months[0]
  if (!first) return 0

  if (!first.lineItems) first.lineItems = {}
  const record = first.lineItems as Record<string, BillingLineItem[]>
  if (!record[billingKey]) record[billingKey] = []

  let injected = 0

  lineItems.forEach((sourceLine, liIndex) => {
    const id = stableLineItemId(billingKey, sourceLine, liIndex)
    const burstSources = burstsForLineItem(sourceLine, liIndex, lineItems, containerBursts)
    if (!burstSourcesHavePositiveFee(burstSources)) return

    const existsOnCanonical = record[billingKey]!.some((li) => li.id === id)
    if (existsOnCanonical) return

    const clientPays = lineClientPaysForMedia(sourceLine)
    const synthetic = createSyntheticBillingLine(id, billingKey, sourceLine, monthKeys, clientPays)
    injected++

    for (const month of months) {
      if (!month.lineItems) month.lineItems = {}
      const monthRecord = month.lineItems as Record<string, BillingLineItem[]>
      const group = monthRecord[billingKey] ?? []
      if (group.some((li) => li.id === id)) continue
      monthRecord[billingKey] = [...group, { ...synthetic, monthlyAmounts: { ...synthetic.monthlyAmounts } }]
    }
  })

  return injected
}

export type SeedLineFeesResult = {
  months: BillingMonth[]
  linesSeeded: number
  skippedAlreadySeeded: number
  linesInjected: number
}

/**
 * Populate `feeMonthlyAmounts` / `totalFeeAmount` on billing line items from burst.feeAmount.
 * Idempotent by value: skips when `totalFeeAmount` matches prorated derived total.
 */
export function seedBillingMonthsLineFees(
  months: BillingMonth[],
  mediaConfigs: SeedLineFeesMediaConfig[],
  stableLineItemId: (mediaKey: string, lineItem: any, index: number) => string,
  _options?: SeedLineFeesOptions
): SeedLineFeesResult {
  if (!months?.length) {
    return { months: months ?? [], linesSeeded: 0, skippedAlreadySeeded: 0, linesInjected: 0 }
  }

  const monthKeys = months.map((m) => m.monthYear)
  const next = months.map((m) => ({
    ...m,
    lineItems: m.lineItems ? { ...m.lineItems } : undefined,
  }))

  let linesSeeded = 0
  let skippedAlreadySeeded = 0
  let linesInjected = 0
  const first = next[0]
  if (!first) {
    return { months: next, linesSeeded, skippedAlreadySeeded, linesInjected }
  }

  for (const { billingKey, lineItems, containerBursts } of mediaConfigs) {
    if (!lineItems?.length) continue

    linesInjected += injectMissingFeeLinesFromMedia(
      next,
      billingKey,
      lineItems,
      monthKeys,
      stableLineItemId,
      containerBursts
    )

    if (!first.lineItems) first.lineItems = {}
    const canonicalGroup = (first.lineItems as Record<string, BillingLineItem[]>)[billingKey]
    if (!canonicalGroup?.length) continue

    for (const billingLine of canonicalGroup) {
      const liIndex = lineItems.findIndex(
        (item, idx) => stableLineItemId(billingKey, item, idx) === billingLine.id
      )
      if (liIndex < 0) continue
      if (billingLine.billingMode === "manual") continue

      const sourceLine = lineItems[liIndex]
      const clientPaysForMedia = lineClientPaysForMedia(sourceLine, billingLine)
      const dimensions = resolveLineDimensions(billingKey, sourceLine)
      const burstSources = burstsForLineItem(sourceLine, liIndex, lineItems, containerBursts)
      if (burstSources.length === 0) continue

      const seeded = prorateBurstFeesToMonths(burstSources, monthKeys)
      const needsDimensionHeal = needsReportDimensionHeal(
        billingLine,
        dimensions,
        clientPaysForMedia
      )

      if (feeAmountsMatch(billingLine.totalFeeAmount, seeded.totalFeeAmount) && !needsDimensionHeal) {
        skippedAlreadySeeded++
        continue
      }

      linesSeeded++

      for (const month of next) {
        if (!month.lineItems) month.lineItems = {}
        const group = (month.lineItems as Record<string, BillingLineItem[]>)[billingKey]
        if (!group?.length) continue
        const idx = group.findIndex((li) => li.id === billingLine.id)
        if (idx < 0) continue
        group[idx] = {
          ...group[idx]!,
          ...dimensions,
          feeMonthlyAmounts: { ...seeded.feeMonthlyAmounts },
          totalFeeAmount: seeded.totalFeeAmount,
          ...(clientPaysForMedia ? { clientPaysForMedia: true } : {}),
        }
      }
    }
  }

  return { months: next, linesSeeded, skippedAlreadySeeded, linesInjected }
}

/** Sum derived line fees for one month across enabled media keys (modal rollup). */
export function sumDerivedLineFeesForMonth(
  months: BillingMonth[],
  monthYear: string,
  mediaKeys: string[]
): number {
  const first = months[0]
  if (!first?.lineItems) return 0
  let sum = 0
  for (const key of mediaKeys) {
    const items = (first.lineItems as Record<string, BillingLineItem[] | undefined>)[key]
    if (!items?.length) continue
    for (const li of items) {
      sum += li.feeMonthlyAmounts?.[monthYear] ?? 0
    }
  }
  return sum
}
