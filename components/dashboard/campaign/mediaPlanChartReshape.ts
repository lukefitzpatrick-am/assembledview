import { prorateAcrossMonths } from "@/lib/billing/prorateAcrossMonths"
import { getMediaLabel } from "@/lib/charts/registry"
import { channelColorFor } from "@/lib/chart-theme"
import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"
import type { NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"

/** Canonical media-type ordering for campaign plan summaries. */
export const MEDIA_PLAN_CHANNEL_ORDER = [
  "television",
  "bvod",
  "digitalVideo",
  "digitalDisplay",
  "digitalAudio",
  "progVideo",
  "progDisplay",
  "progBvod",
  "progAudio",
  "progOoh",
  "socialMedia",
  "search",
  "radio",
  "ooh",
  "cinema",
  "newspaper",
  "magazines",
  "integration",
  "influencers",
  "production",
] as const

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

export type MediaChannelSummaryRow = {
  mediaType: string
  label: string
  totalBudget: number
  lineItemCount: number
  rangeStart?: string
  rangeEnd?: string
  sparkline: number[]
}

export function burstGross(burst: { budget?: number; deliverablesAmount?: number }): number {
  const fromDeliverables =
    typeof burst.deliverablesAmount === "number" && Number.isFinite(burst.deliverablesAmount)
      ? burst.deliverablesAmount
      : 0
  const fromBudget = typeof burst.budget === "number" && Number.isFinite(burst.budget) ? burst.budget : 0
  return fromDeliverables > 0 ? fromDeliverables : fromBudget
}

function monthKeysForRange(start: Date, end: Date): string[] {
  const keys: string[] = []
  let cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= last) {
    keys.push(`${MONTH_NAMES[cur.getMonth()]} ${cur.getFullYear()}`)
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  return keys
}

function monthKeyToDate(key: string): Date {
  const m = key.match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (!m) return new Date(0)
  const monthIdx = MONTH_NAMES.findIndex((name) => name === m[1])
  return new Date(Number(m[2]), monthIdx >= 0 ? monthIdx : 0, 1)
}

function formatPeriodLabel(monthYear: string): string {
  const d = monthKeyToDate(monthYear)
  if (Number.isNaN(d.getTime())) return monthYear
  return d.toLocaleDateString("en-AU", { month: "short", year: "numeric" })
}

function sortByMediaOrder<T extends { mediaType: string }>(
  rows: T[],
  order: readonly string[] = MEDIA_PLAN_CHANNEL_ORDER,
): T[] {
  const orderMap = new Map(order.map((key, idx) => [key.toLowerCase(), idx]))
  return [...rows].sort(
    (a, b) =>
      (orderMap.get(a.mediaType.toLowerCase()) ?? 999) - (orderMap.get(b.mediaType.toLowerCase()) ?? 999),
  )
}

/** Per-channel totals + sparkline samples (CHART-INDEX summary rows). */
export function reshapeMediaPlanChannelSummary(
  normalised: Record<string, NormalisedLineItem[]>,
  order: readonly string[] = MEDIA_PLAN_CHANNEL_ORDER,
): MediaChannelSummaryRow[] {
  const rows = Object.entries(normalised).map(([mediaType, items]) => {
    const typed = (items || []) as NormalisedLineItem[]
    const totalBudget = typed.reduce(
      (sum, item) => sum + item.bursts.reduce((burstSum, burst) => burstSum + burstGross(burst), 0),
      0,
    )
    const starts = typed.flatMap((item) => item.bursts.map((burst) => burst.startDate)).filter(Boolean)
    const ends = typed.flatMap((item) => item.bursts.map((burst) => burst.endDate)).filter(Boolean)
    const sparkline = typed
      .flatMap((item) => item.bursts.map((burst) => burstGross(burst)))
      .slice(0, 12)

    return {
      mediaType,
      label: getMediaLabel(mediaType),
      totalBudget,
      lineItemCount: typed.length,
      rangeStart: starts.length ? starts.sort()[0] : undefined,
      rangeEnd: ends.length ? ends.sort()[ends.length - 1] : undefined,
      sparkline: sparkline.length ? sparkline : [0],
    }
  })

  return sortByMediaOrder(
    rows.filter((row) => row.lineItemCount > 0),
    order,
  )
}

/** DonutChart slices — media-mix share by channel. */
export function reshapeMediaMixDonut(rows: MediaChannelSummaryRow[]) {
  return rows
    .filter((row) => row.totalBudget > 0)
    .map((row, i) => ({
      label: row.label,
      value: row.totalBudget,
      color: channelColorFor(row.mediaType, i),
    }))
}

/** HorizontalBarChart rows — per-channel gross spend. */
export function reshapeChannelSpendBars(rows: MediaChannelSummaryRow[]) {
  return [...rows]
    .filter((row) => row.totalBudget > 0)
    .sort((a, b) => a.totalBudget - b.totalBudget)
    .map((row) => ({
      cat: row.label,
      value: row.totalBudget,
    }))
}

/** Sparkline datum rows for a channel burst sample. */
export function reshapeChannelSparkline(values: number[]) {
  return values.map((value, idx) => ({ idx, value }))
}

export type AllocationStackedShape = {
  data: Array<Record<string, number | string>>
  series: Array<{ key: string; label: string; color: string }>
}

/**
 * Prorated monthly allocation by channel — StackedBarChart / StackedAreaChart shape.
 * Each row: { period, [mediaType]: amount, ... }.
 */
export function reshapeAllocationOverTime(
  normalised: Record<string, NormalisedLineItem[]>,
  order: readonly string[] = MEDIA_PLAN_CHANNEL_ORDER,
): AllocationStackedShape {
  const byChannelMonth = new Map<string, Map<string, number>>()

  for (const [mediaType, items] of Object.entries(normalised)) {
    if (!Array.isArray(items) || items.length === 0) continue

    for (const item of items) {
      for (const burst of item.bursts) {
        const amount = burstGross(burst)
        if (amount <= 0 || !burst.startDate) continue

        const start = coerceBurstDateLocal(burst.startDate)
        const end = coerceBurstDateLocal(burst.endDate || burst.startDate)
        if (!start || !end) continue
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) continue

        const shares = prorateAcrossMonths({
          amount,
          burstStart: start,
          burstEnd: end,
          monthKeys: monthKeysForRange(start, end),
        })

        let channelMonths = byChannelMonth.get(mediaType)
        if (!channelMonths) {
          channelMonths = new Map()
          byChannelMonth.set(mediaType, channelMonths)
        }
        for (const [monthKey, share] of Object.entries(shares)) {
          channelMonths.set(monthKey, (channelMonths.get(monthKey) ?? 0) + share)
        }
      }
    }
  }

  const channelKeys = sortByMediaOrder(
    Array.from(byChannelMonth.entries())
      .filter(([, months]) => Array.from(months.values()).some((v) => v > 0))
      .map(([mediaType]) => ({ mediaType })),
    order,
  ).map((row) => row.mediaType)

  const periodKeys = new Set<string>()
  for (const months of byChannelMonth.values()) {
    for (const [monthKey, amount] of months.entries()) {
      if (amount > 0) periodKeys.add(monthKey)
    }
  }

  const sortedPeriods = Array.from(periodKeys).sort(
    (a, b) => monthKeyToDate(a).getTime() - monthKeyToDate(b).getTime(),
  )

  const data = sortedPeriods.map((monthKey) => {
    const row: Record<string, number | string> = { period: formatPeriodLabel(monthKey) }
    for (const mediaType of channelKeys) {
      row[mediaType] = byChannelMonth.get(mediaType)?.get(monthKey) ?? 0
    }
    return row
  })

  const series = channelKeys.map((key, i) => ({
    key,
    label: getMediaLabel(key),
    color: channelColorFor(key, i),
  }))

  return { data, series }
}
