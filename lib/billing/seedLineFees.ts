import { format } from "date-fns"

import type { BillingBurst, BillingLineItem, BillingMonth } from "@/lib/billing/types"

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

function parseMoney(v: unknown): number {
  return parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0
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

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
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
 */
export function prorateBurstFeesToMonths(
  bursts: SeedBurstSource[],
  monthKeys: string[],
  mode: "billing" | "delivery",
  lineClientPaysForMedia: boolean
): { feeMonthlyAmounts: Record<string, number>; totalFeeAmount: number } {
  const feeMonthlyAmounts: Record<string, number> = {}
  monthKeys.forEach((key) => {
    feeMonthlyAmounts[key] = 0
  })

  for (const burst of bursts) {
    const startDate = toDate(burst.startDate)
    const endDate = toDate(burst.endDate)
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) continue

    let feeForBurst = burst.feeAmount
    const burstClientPays = Boolean(burst.clientPaysForMedia ?? lineClientPaysForMedia)
    if (mode === "billing" && burstClientPays) feeForBurst = 0
    if (feeForBurst <= 0) continue

    const sLocalMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    const eLocalMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
    const daysTotal =
      Math.round((eLocalMidnight.getTime() - sLocalMidnight.getTime()) / (1000 * 60 * 60 * 24)) + 1
    if (daysTotal <= 0) continue

    let currentDate = new Date(sLocalMidnight.getFullYear(), sLocalMidnight.getMonth(), 1)
    const lastMonthCursor = new Date(eLocalMidnight.getFullYear(), eLocalMidnight.getMonth(), 1)

    while (currentDate <= lastMonthCursor) {
      const monthKey = format(currentDate, "MMMM yyyy")
      if (Object.prototype.hasOwnProperty.call(feeMonthlyAmounts, monthKey)) {
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
        const sliceStartMs = Math.max(sLocalMidnight.getTime(), monthStart.getTime())
        const sliceEndMs = Math.min(eLocalMidnight.getTime(), monthEnd.getTime())
        const daysInMonth = Math.round((sliceEndMs - sliceStartMs) / (1000 * 60 * 60 * 24)) + 1
        if (daysInMonth > 0) {
          feeMonthlyAmounts[monthKey] += feeForBurst * (daysInMonth / daysTotal)
        }
      }
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    }
  }

  const totalFeeAmount = Object.values(feeMonthlyAmounts).reduce((sum, val) => sum + val, 0)
  return { feeMonthlyAmounts, totalFeeAmount }
}

export type SeedLineFeesResult = {
  months: BillingMonth[]
  linesSeeded: number
  skippedAlreadySeeded: number
}

/**
 * Populate `feeMonthlyAmounts` / `totalFeeAmount` on billing line items that lack them.
 * Idempotent: skips rows where `totalFeeAmount` is already defined (including 0).
 */
export function seedBillingMonthsLineFees(
  months: BillingMonth[],
  mediaConfigs: SeedLineFeesMediaConfig[],
  stableLineItemId: (mediaKey: string, lineItem: any, index: number) => string,
  options?: SeedLineFeesOptions
): SeedLineFeesResult {
  if (!months?.length) {
    return { months: months ?? [], linesSeeded: 0, skippedAlreadySeeded: 0 }
  }

  const mode = options?.mode ?? "billing"
  const monthKeys = months.map((m) => m.monthYear)
  const next = months.map((m) => ({
    ...m,
    lineItems: m.lineItems ? { ...m.lineItems } : undefined,
  }))

  let linesSeeded = 0
  let skippedAlreadySeeded = 0
  const first = next[0]
  if (!first) {
    return { months: next, linesSeeded, skippedAlreadySeeded }
  }

  for (const { billingKey, lineItems, containerBursts } of mediaConfigs) {
    if (!lineItems?.length) continue
    if (!first.lineItems) first.lineItems = {}
    const canonicalGroup = (first.lineItems as Record<string, BillingLineItem[]>)[billingKey]
    if (!canonicalGroup?.length) continue

    for (const billingLine of canonicalGroup) {
      if (billingLine.totalFeeAmount !== undefined) {
        skippedAlreadySeeded++
        continue
      }

      const liIndex = lineItems.findIndex(
        (item, idx) => stableLineItemId(billingKey, item, idx) === billingLine.id
      )
      if (liIndex < 0) continue

      const sourceLine = lineItems[liIndex]
      const clientPaysForMedia = Boolean(
        sourceLine?.client_pays_for_media ??
          sourceLine?.clientPaysForMedia ??
          billingLine.clientPaysForMedia
      )
      const burstSources = burstsForLineItem(sourceLine, liIndex, lineItems, containerBursts)
      if (burstSources.length === 0) continue

      const seeded = prorateBurstFeesToMonths(burstSources, monthKeys, mode, clientPaysForMedia)
      linesSeeded++

      for (const month of next) {
        if (!month.lineItems) month.lineItems = {}
        const group = (month.lineItems as Record<string, BillingLineItem[]>)[billingKey]
        if (!group?.length) continue
        const idx = group.findIndex((li) => li.id === billingLine.id)
        if (idx < 0) continue
        group[idx] = {
          ...group[idx]!,
          feeMonthlyAmounts: seeded.feeMonthlyAmounts,
          totalFeeAmount: seeded.totalFeeAmount,
          ...(clientPaysForMedia ? { clientPaysForMedia: true } : {}),
        }
      }
    }
  }

  return { months: next, linesSeeded, skippedAlreadySeeded }
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
