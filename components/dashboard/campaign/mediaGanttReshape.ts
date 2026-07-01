import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
} from "date-fns"

import type { GanttBurst, GanttRow } from "@/components/charts/system"
import { channelColorFor } from "@/lib/chart-theme"
import { getMediaLabel } from "@/lib/charts/registry"
import {
  buildGanttSidelineLabel,
  groupByLineItemId,
  type NormalisedLineItem,
} from "@/lib/mediaplan/normalizeLineItem"

export type MediaGanttGranularity = "weekly" | "monthly"

export type ReshapedMediaGantt = {
  rows: GanttRow[]
  weeks: number
  months: string[]
  weeksPerMonth: number
  todayWeek: number | null
}

function safeParseDate(value?: string) {
  if (!value) return null
  try {
    const parsed = parseISO(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  } catch {
    return null
  }
}

function safeNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/** Whole-number deliverables for bar labels (no decimals). */
function formatDeliverablesDisplay(value: number): string {
  return Math.round(value).toLocaleString("en-AU", { maximumFractionDigits: 0 })
}

/** Group consecutive calendar days into Sun-start weeks (matches legacy Gantt). */
function chunkDaysIntoWeeks(days: Date[]): Date[][] {
  const weeks: Date[][] = []
  let currentWeek: Date[] = []
  days.forEach((day, index) => {
    if (day.getDay() === 0 && currentWeek.length > 0) {
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
): ReshapedMediaGantt | null {
  const safeStart = safeParseDate(startDate)
  const safeEnd = safeParseDate(endDate)
  if (!safeStart || !safeEnd) return null

  const start = startOfDay(safeStart)
  const end = endOfDay(safeEnd)
  const allDays = eachDayOfInterval({ start, end })
  if (allDays.length === 0) return null

  const isMonthly = granularity === "monthly"
  const sunWeeks = chunkDaysIntoWeeks(allDays)
  const monthStarts = eachMonthOfInterval({ start: startOfMonth(start), end: endOfMonth(end) })
  const totalWeeks = isMonthly ? Math.max(1, monthStarts.length) : Math.max(1, sunWeeks.length)

  const monthLabels = monthStarts.map((m) => format(m, "MMM"))
  const weeksPerMonth = isMonthly ? 1 : Math.max(1, Math.ceil(totalWeeks / Math.max(1, monthLabels.length)))

  const paddedMonthLabels =
    weeksPerMonth * monthLabels.length < totalWeeks
      ? [...monthLabels, ...Array(Math.ceil(totalWeeks / weeksPerMonth) - monthLabels.length).fill(monthLabels.at(-1) ?? "")]
      : monthLabels

  const rows: GanttRow[] = []
  let rowIndex = 0

  Object.entries(lineItems || {}).forEach(([mediaType, items]) => {
    if (!Array.isArray(items)) return
    const groupedItems = groupByLineItemId(items, mediaType)

    groupedItems.forEach((item) => {
      const bursts: GanttBurst[] = []
      let rowMaxDeliverables = 0

      const pendingBursts: Array<{ burst: GanttBurst; deliverables: number }> = []

      item.bursts.forEach((burst) => {
        const barStart = safeParseDate(burst.startDate)
        const barEnd = safeParseDate(burst.endDate) || barStart
        if (!barStart || !barEnd) return
        if (barEnd < start || barStart > end) return

        const clampedStart = clampDate(barStart, start, end)
        const clampedEnd = clampDate(barEnd, start, end)
        const deliverables = safeNumber(burst.deliverables ?? 0)
        rowMaxDeliverables = Math.max(rowMaxDeliverables, deliverables)

        let startWeek: number
        let endWeek: number

        if (isMonthly) {
          startWeek = indexOfMonth(clampedStart, monthStarts)
          endWeek = indexOfMonth(clampedEnd, monthStarts) + 1
        } else {
          startWeek = indexOfWeek(clampedStart, sunWeeks)
          endWeek = indexOfWeek(clampedEnd, sunWeeks) + 1
        }

        if (endWeek <= startWeek) endWeek = startWeek + 1

        pendingBursts.push({
          deliverables,
          burst: {
            startWeek,
            endWeek,
            label: burstLabel(deliverables, clampedStart, clampedEnd),
          },
        })
      })

      if (pendingBursts.length === 0) return

      const intensityBase = rowMaxDeliverables > 0 ? rowMaxDeliverables : 1
      pendingBursts.forEach(({ burst, deliverables }) => {
        bursts.push({
          ...burst,
          intensity:
            deliverables > 0 ? Math.max(0.35, deliverables / intensityBase) : 0.75,
        })
      })

      rows.push({
        label: buildGanttSidelineLabel(item),
        sub: getMediaLabel(mediaType),
        color: channelColorFor(mediaType, rowIndex),
        bursts,
      })
      rowIndex += 1
    })
  })

  if (rows.length === 0) return null

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
      todayWeek = differenceInCalendarDays(today, start) / 7
    }
  }

  return {
    rows,
    weeks: totalWeeks,
    months: paddedMonthLabels.slice(0, Math.ceil(totalWeeks / weeksPerMonth)),
    weeksPerMonth,
    todayWeek,
  }
}
