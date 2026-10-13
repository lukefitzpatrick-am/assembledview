import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
} from "date-fns"

import type { GanttBurst, GanttRow } from "@/components/charts/system"
import { channelColorFor } from "@/lib/chart-theme"
import { getMediaLabel } from "@/lib/charts/registry"
import { fromCents, parseMoney, sumCents, toCentsOrNull } from "@/lib/money"
import { coerceBurstDateLocal } from "@/lib/mediaplan/burstDate"
import {
  buildGanttSidelineLabel,
  groupByLineItemId,
  type NormalisedLineItem,
} from "@/lib/mediaplan/normalizeLineItem"
import { cleanPacingLineItemId } from "@/lib/pacing/delivery/lineItemIds"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"

export type MediaGanttGranularity = "weekly" | "monthly"

export type GanttMonthBand = {
  label: string
  /** Inclusive start week index (0-based). */
  startWeek: number
  /** Number of week columns this calendar month spans. */
  weeks: number
}

export type ReshapedMediaGantt = {
  rows: GanttRow[]
  weeks: number
  months: string[]
  /** Legacy equal-width fallback; prefer `monthBands` for weekly view. */
  weeksPerMonth: number
  /** Calendar-aligned month header spans (weekly view). */
  monthBands?: GanttMonthBand[]
  /** Monday week-start day number for each weekly column. Omitted in monthly view. */
  weekLabels?: string[]
  todayWeek: number | null
  /** Inclusive campaign length in civil days. */
  totalDays: number
  /** Melbourne today as an index into `totalDays`. Null outside the campaign. */
  todayDay: number | null
  /** Day index of each Monday (or campaign-start) week boundary. */
  weekDayIndexes: number[]
}

function safeParseDate(value?: string) {
  return coerceBurstDateLocal(value)
}

function safeNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/** Whole-number deliverables for bar labels (no decimals). */
function formatDeliverablesDisplay(value: number): string {
  return Math.round(value).toLocaleString("en-AU", { maximumFractionDigits: 0 })
}

/** Compact deliverables: 10.7K, 445K, 1.77M (millions keep two fraction digits). */
function compactDeliverables(value: number): string {
  const digits = Math.abs(value) >= 1_000_000 ? 2 : 1
  return new Intl.NumberFormat("en-AU", {
    notation: "compact",
    maximumFractionDigits: digits,
  }).format(value)
}

function burstDateSpan(startYmd: string, endYmd: string): string {
  const start = safeParseDate(startYmd)
  const end = safeParseDate(endYmd)
  if (!start || !end) return `${startYmd} – ${endYmd}`
  return `${format(start, "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`
}

/**
 * Burst that contains today, else the started burst with the latest start.
 * -1 when every burst is still in the future.
 */
function deliveryCarrierIndex(
  pending: ReadonlyArray<{ startYmd: string; endYmd: string }>,
  todayISO: string,
): number {
  const containing = pending.findIndex(
    (burst) => todayISO >= burst.startYmd && todayISO <= burst.endYmd,
  )
  if (containing >= 0) return containing
  let best = -1
  let bestStart = ""
  pending.forEach((burst, index) => {
    if (burst.startYmd <= todayISO && burst.startYmd >= bestStart) {
      bestStart = burst.startYmd
      best = index
    }
  })
  return best
}

/**
 * Group consecutive calendar days into Monday-start weeks.
 * Dates are Sydney/Melbourne civil days (`coerceBurstDateLocal`), so `getDay()`
 * is that calendar weekday.
 */
function chunkDaysIntoWeeks(days: Date[]): Date[][] {
  const weeks: Date[][] = []
  let currentWeek: Date[] = []
  days.forEach((day, index) => {
    if (day.getDay() === 1 && currentWeek.length > 0) {
      weeks.push(currentWeek)
      currentWeek = [day]
    } else {
      currentWeek.push(day)
    }
    if (index === days.length - 1 && currentWeek.length > 0) {
      weeks.push(currentWeek)
    }
  })
  return weeks
}

function indexOfMonth(date: Date, monthStarts: Date[]): number {
  for (let i = monthStarts.length - 1; i >= 0; i--) {
    if (date >= monthStarts[i]) return i
  }
  return 0
}

function indexOfWeek(date: Date, weeks: Date[][]): number {
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (date >= weeks[i][0]) return i
  }
  return 0
}

function burstLabel(
  deliverables: number,
  start: Date,
  end: Date,
): string | undefined {
  if (deliverables > 0) return formatDeliverablesDisplay(deliverables)
  return `${format(start, "d/M")}–${format(end, "d/M")}`
}

function clampDate(date: Date, start: Date, end: Date) {
  if (date < start) return start
  if (date > end) return end
  return date
}

/**
 * Convert normalised line items + campaign window into library `MediaGanttChart` props.
 * Data/query logic stays upstream — this is presentation shaping only.
 */
export function reshapeLineItemsToMediaGantt(
  lineItems: Record<string, NormalisedLineItem[]>,
  startDate: string,
  endDate: string,
  granularity: MediaGanttGranularity = "weekly",
  deliveredByLineId?: ReadonlyMap<string, number>,
  flighting = false,
): ReshapedMediaGantt | null {
  const safeStart = safeParseDate(startDate)
  const safeEnd = safeParseDate(endDate)
  if (!safeStart || !safeEnd) return null

  const start = startOfDay(safeStart)
  const end = endOfDay(safeEnd)
  const allDays = eachDayOfInterval({ start, end })
  if (allDays.length === 0) return null

  const isMonthly = granularity === "monthly"
  const mondayWeeks = chunkDaysIntoWeeks(allDays)
  const monthStarts = eachMonthOfInterval({ start: startOfMonth(start), end: endOfMonth(end) })
  const totalWeeks = isMonthly ? Math.max(1, monthStarts.length) : Math.max(1, mondayWeeks.length)

  const monthLabels = monthStarts.map((m) => format(m, "MMM"))
  // Weekly: band width = Monday-weeks whose first day falls in that calendar month.
  // Monthly: one column per calendar month.
  let monthBands: GanttMonthBand[] | undefined
  let weeksPerMonth = 1
  let paddedMonthLabels = monthLabels

  if (isMonthly) {
    weeksPerMonth = 1
    monthBands = monthLabels.map((label, i) => ({ label, startWeek: i, weeks: 1 }))
  } else {
    const bands: GanttMonthBand[] = []
    mondayWeeks.forEach((week, wi) => {
      const label = format(week[0], "MMM")
      const last = bands[bands.length - 1]
      if (last && last.label === label) {
        last.weeks += 1
      } else {
        bands.push({ label, startWeek: wi, weeks: 1 })
      }
    })
    monthBands = bands
    paddedMonthLabels = bands.map((b) => b.label)
    weeksPerMonth = bands.length > 0 ? Math.max(1, Math.round(totalWeeks / bands.length)) : 1
  }

  const rows: GanttRow[] = []
  let rowIndex = 0
  const todayISO = getMelbourneTodayISO()

  Object.entries(lineItems || {}).forEach(([mediaType, items]) => {
    if (!Array.isArray(items)) return
    const groupedItems = groupByLineItemId(items, mediaType)

    groupedItems.forEach((item) => {
      const bursts: GanttBurst[] = []
      let rowMaxDeliverables = 0
      let earliestStart: Date | null = null
      const lineId = cleanPacingLineItemId(item.lineItemId)
      const hasDelivery = lineId != null && deliveredByLineId?.has(lineId) === true
      const delivered = hasDelivery ? (deliveredByLineId!.get(lineId!) ?? 0) : null

      const pendingBursts: Array<{
        burst: GanttBurst
        deliverables: number
        startYmd: string
        endYmd: string
      }> = []
      const budgetCents: number[] = []

      item.bursts.forEach((burst) => {
        const barStart = safeParseDate(burst.startDate)
        const barEnd = safeParseDate(burst.endDate) || barStart
        if (!barStart || !barEnd) return
        if (barEnd < start || barStart > end) return

        const parsedBudget = parseMoney(burst.budget)
        const cents = parsedBudget == null ? null : toCentsOrNull(parsedBudget)
        if (cents != null) budgetCents.push(cents)

        const clampedStart = clampDate(barStart, start, end)
        const clampedEnd = clampDate(barEnd, start, end)
        const deliverables = safeNumber(burst.deliverables ?? 0)
        rowMaxDeliverables = Math.max(rowMaxDeliverables, deliverables)
        if (!earliestStart || barStart < earliestStart) earliestStart = barStart

        let startWeek: number
        let endWeek: number

        if (isMonthly) {
          startWeek = indexOfMonth(clampedStart, monthStarts)
          endWeek = indexOfMonth(clampedEnd, monthStarts) + 1
        } else {
          startWeek = indexOfWeek(clampedStart, mondayWeeks)
          endWeek = indexOfWeek(clampedEnd, mondayWeeks) + 1
        }

        if (endWeek <= startWeek) endWeek = startWeek + 1

        pendingBursts.push({
          deliverables,
          startYmd: format(barStart, "yyyy-MM-dd"),
          endYmd: format(barEnd, "yyyy-MM-dd"),
          burst: {
            startWeek,
            endWeek,
            startDay: differenceInCalendarDays(clampedStart, start),
            endDay: differenceInCalendarDays(clampedEnd, start),
            label: burstLabel(deliverables, clampedStart, clampedEnd),
          },
        })
      })

      if (pendingBursts.length === 0) return

      const startsAfterToday =
        earliestStart != null && format(earliestStart, "yyyy-MM-dd") > todayISO
      const startLabel = startsAfterToday && earliestStart && !hasDelivery
        ? `Starts ${format(earliestStart, "d MMM")}`
        : undefined
      const linePlanned = pendingBursts.reduce((sum, pending) => sum + pending.deliverables, 0)

      const intensityBase = rowMaxDeliverables > 0 ? rowMaxDeliverables : 1
      if (flighting) {
        const carrier = deliveryCarrierIndex(pendingBursts, todayISO)
        const deliveryText =
          hasDelivery && delivered != null
            ? `${compactDeliverables(delivered)} of ${compactDeliverables(linePlanned)}`
            : undefined
        pendingBursts.forEach(({ burst, deliverables, startYmd, endYmd }, index) => {
          const containsToday = todayISO >= startYmd && todayISO <= endYmd
          const isCarrier = index === carrier && deliveryText != null
          let label: string | undefined
          let fillRatio: number | undefined
          if (isCarrier) {
            label = deliveryText
            fillRatio = linePlanned > 0 ? delivered! / linePlanned : 0
          } else if (endYmd < todayISO) {
            label = `${compactDeliverables(deliverables)} planned`
          } else if (startYmd > todayISO) {
            const start = safeParseDate(startYmd)
            label = start ? `Starts ${format(start, "d MMM")}` : undefined
          }
          bursts.push({
            ...burst,
            label,
            fillRatio,
            intensity:
              deliverables > 0 ? Math.max(0.35, deliverables / intensityBase) : 0.75,
            tone: containsToday ? "active" : "context",
            tooltip: [
              burstDateSpan(startYmd, endYmd),
              `${compactDeliverables(deliverables)} planned`,
              isCarrier ? `Line delivered to date ${deliveryText}` : null,
            ]
              .filter((line): line is string => line != null)
              .join("\n"),
          })
        })
      } else {
        pendingBursts.forEach(({ burst, deliverables }) => {
          const planned = linePlanned > 0 ? linePlanned : deliverables
          const deliveryLabel =
            hasDelivery && delivered != null
              ? `${formatDeliverablesDisplay(delivered)} / ${formatDeliverablesDisplay(planned)}`
              : undefined
          bursts.push({
            ...burst,
            label: deliveryLabel ?? startLabel ?? burst.label,
            fillRatio:
              hasDelivery && delivered != null
                ? planned > 0 ? delivered / planned : 0
                : undefined,
            intensity:
              deliverables > 0 ? Math.max(0.35, deliverables / intensityBase) : 0.75,
          })
        })
      }

      rows.push({
        label: buildGanttSidelineLabel(item),
        sub: getMediaLabel(mediaType),
        channelKey: mediaType,
        ...(budgetCents.length > 0 ? { plannedMedia: fromCents(sumCents(budgetCents)) } : {}),
        color: channelColorFor(mediaType, rowIndex),
        bursts,
      })
      rowIndex += 1
    })
  })

  if (rows.length === 0) return null

  const melbourneToday = safeParseDate(todayISO)
  let todayDay: number | null = null
  if (melbourneToday) {
    const day = startOfDay(melbourneToday)
    if (day >= start && day <= end) todayDay = differenceInCalendarDays(day, start)
  }

  const today = startOfDay(new Date())
  let todayWeek: number | null = null
  if (today >= start && today <= end) {
    if (isMonthly) {
      const monthIdx = indexOfMonth(today, monthStarts)
      const monthStart = monthStarts[monthIdx] ?? start
      const daysInMonth = differenceInCalendarDays(endOfMonth(monthStart), monthStart) + 1
      const dayInMonth = differenceInCalendarDays(today, monthStart)
      const fraction = daysInMonth > 0 ? dayInMonth / daysInMonth : 0.5
      todayWeek = monthIdx + Math.min(0.95, Math.max(0.05, fraction))
    } else {
      const weekIdx = indexOfWeek(today, mondayWeeks)
      const week = mondayWeeks[weekIdx] ?? []
      const weekStart = week[0] ?? today
      const weekEnd = week[week.length - 1] ?? weekStart
      const weekLen = Math.max(1, differenceInCalendarDays(weekEnd, weekStart) + 1)
      const dayInWeek = differenceInCalendarDays(today, weekStart)
      const fraction = Math.min(0.95, Math.max(0.05, dayInWeek / weekLen))
      todayWeek = weekIdx + fraction
    }
  }

  return {
    rows,
    weeks: totalWeeks,
    months: paddedMonthLabels,
    weeksPerMonth,
    monthBands,
    weekLabels: isMonthly ? undefined : mondayWeeks.map((week) => format(week[0] ?? start, "d")),
    todayWeek,
    totalDays: allDays.length,
    todayDay,
    weekDayIndexes: mondayWeeks.map((week) => differenceInCalendarDays(week[0] ?? start, start)),
  }
}
