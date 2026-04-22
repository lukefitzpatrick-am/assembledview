"use client"

import { forwardRef, useMemo } from "react"
import {
  format,
  eachDayOfInterval,
  eachMonthOfInterval,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  differenceInCalendarDays,
  parseISO,
} from "date-fns"
import {
  groupByLineItemId,
  buildGanttSidelineLabel,
  type NormalisedLineItem,
} from "@/lib/mediaplan/normalizeLineItem"
import { getMediaColor } from "@/lib/charts/registry"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export interface MediaGanttChartProps {
  lineItems: Record<string, NormalisedLineItem[]>
  startDate: string
  endDate: string
  granularity?: "weekly" | "monthly"
}

/** Pixel width per week column (no per-day columns). */
const WEEK_WIDTH = 80
const LABEL_WIDTH = 224
const MIN_BAR_PX = 6
/** Minimum bar width as % of timeline (monthly fluid) so thin bursts stay visible. */
const MIN_BAR_PCT = 0.22

function safeNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/** Whole-number deliverables for bar labels and tooltips (no decimals). */
function formatDeliverablesDisplay(value: number): string {
  return Math.round(value).toLocaleString("en-AU", { maximumFractionDigits: 0 })
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

/** Group consecutive calendar days into Sun-start weeks. */
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

const MediaGanttChart = forwardRef<HTMLDivElement, MediaGanttChartProps>(function MediaGanttChart(
  { lineItems, startDate, endDate, granularity = "weekly" },
  ref
) {
  const ganttData = useMemo(() => {
    const safeStart = safeParseDate(startDate)
    const safeEnd = safeParseDate(endDate)
    if (!safeStart || !safeEnd) return null

    const start = startOfDay(safeStart)
    const end = endOfDay(safeEnd)

    const allDays = eachDayOfInterval({ start, end })
    const totalDays = allDays.length
    if (totalDays === 0) return null

    const rows: Array<{
      label: string
      mediaType: string
      publisher?: string
      targeting?: string
      bars: Array<{
        start: Date
        end: Date
        startOffset: number
        width: number
        deliverables: number
      }>
    }> = []

    Object.entries(lineItems || {}).forEach(([mediaType, items]) => {
      if (!Array.isArray(items)) return
      const groupedItems = groupByLineItemId(items, mediaType)

      groupedItems.forEach((item) => {
        const label = buildGanttSidelineLabel(item)

        const bars = item.bursts
          .map((burst) => {
            const barStart = safeParseDate(burst.startDate)
            const barEnd = safeParseDate(burst.endDate) || barStart
            if (!barStart || !barEnd) return null

            if (barEnd < start || barStart > end) return null

            const clampedStart = barStart < start ? start : barStart
            const clampedEnd = barEnd > end ? end : barEnd

            const startOffset = differenceInCalendarDays(clampedStart, start)
            const width = Math.max(1, differenceInCalendarDays(clampedEnd, clampedStart) + 1)

            const deliverables = safeNumber(burst.deliverables ?? 0)

            return {
              start: clampedStart,
              end: clampedEnd,
              startOffset,
              width,
              deliverables,
            }
          })
          .filter(Boolean) as Array<{
            start: Date
            end: Date
            startOffset: number
            width: number
            deliverables: number
          }>

        if (bars.length > 0) {
          rows.push({
            label,
            mediaType,
            publisher: item.publisher || item.platform || item.network || item.site || item.station,
            targeting: item.targeting,
            bars,
          })
        }
      })
    })

    const today = startOfDay(new Date())
    const todayOffset =
      today >= start && today <= end ? differenceInCalendarDays(today, start) : null

    const weeks = chunkDaysIntoWeeks(allDays)
    const months = eachMonthOfInterval({ start: startOfMonth(start), end: endOfMonth(end) })
    const totalWidthPx = weeks.length * WEEK_WIDTH

    return {
      rows,
      weeks,
      months,
      totalDays,
      totalWidthPx,
      todayOffset,
      granularity,
    }
  }, [lineItems, startDate, endDate, granularity])

  if (!ganttData || ganttData.rows.length === 0) {
    return (
      <div ref={ref} className="flex h-48 items-center justify-center text-muted-foreground">
        No timeline data available
      </div>
    )
  }

  const { rows, weeks, months, totalDays, totalWidthPx, todayOffset, granularity: gran } = ganttData
  const isMonthly = gran === "monthly"
  const headerWidthPx = totalWidthPx + LABEL_WIDTH
  const ariaGranularity = isMonthly ? "month view" : "week view"

  const dayToXPx = (dayOffset: number) => (dayOffset / totalDays) * totalWidthPx
  const spanToWPx = (spanDays: number) => Math.max(MIN_BAR_PX, (spanDays / totalDays) * totalWidthPx)

  const dayToXPct = (dayOffset: number) => (dayOffset / totalDays) * 100
  const spanToWPct = (spanDays: number) =>
    Math.max(MIN_BAR_PCT, (spanDays / totalDays) * 100)

  const labelColClass = "flex w-56 shrink-0 items-center gap-2 border-r border-border/50 p-2 text-sm font-medium"

  if (isMonthly) {
    return (
      <TooltipProvider delayDuration={120}>
        <div
          ref={ref}
          data-export="media-plan-gantt-root"
          className="w-full overflow-hidden rounded-xl border border-border/60 bg-background/60"
          role="region"
          aria-label={`Campaign media timeline, ${rows.length} rows, ${ariaGranularity}`}
        >
          <div className="w-full min-w-0">
            <div className="sticky top-0 z-20 flex w-full min-w-0 border-b border-border/70 bg-background/95 backdrop-blur">
              <div className="w-56 shrink-0 border-r border-border/70 bg-background/95" aria-hidden />
              <div className="flex min-w-0 flex-1">
                {months.map((monthStart, monthIndex) => (
                  <div
                    key={monthIndex}
                    className="flex min-w-0 flex-1 items-center justify-center border-r border-border/40 px-1 py-2 text-center text-xs font-semibold text-foreground last:border-r-0"
                  >
                    <span className="line-clamp-2 leading-tight">{format(monthStart, "MMM yyyy")}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative w-full">
              {todayOffset !== null ? (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-10 border-l-2 border-dashed border-sky-500/70"
                  style={{
                    left: `calc(${LABEL_WIDTH}px + (100% - ${LABEL_WIDTH}px) * ${todayOffset / totalDays})`,
                  }}
                >
                  <span className="absolute -top-2 -translate-x-1/2 rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    Today
                  </span>
                </div>
              ) : null}
              {rows.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className={cn(
                    "relative flex w-full min-w-0 items-center border-b border-border/40",
                    rowIndex % 2 === 1 && "bg-muted/[0.05]"
                  )}
                >
                  <div className={labelColClass}>
                    <span
                      className="h-6 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getMediaColor(row.mediaType) }}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="min-w-0 flex-1 cursor-default truncate">{row.label}</div>
                      </TooltipTrigger>
                      <TooltipContent>{row.label}</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="relative min-h-[48px] min-w-0 flex-1">
                    {row.bars.map((bar, barIndex) => {
                      const leftPct = dayToXPct(bar.startOffset)
                      const widthPct = spanToWPct(bar.width)
                      const barColor = getMediaColor(row.mediaType)
                      return (
                        <Tooltip key={barIndex}>
                          <TooltipTrigger asChild>
                            <div
                              className="absolute top-1/2 flex h-6 max-w-full -translate-y-1/2 cursor-default items-center justify-center rounded-md border border-black/10 text-xs font-medium text-white shadow-sm transition-transform duration-150 hover:scale-[1.01]"
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                backgroundColor: barColor,
                                minWidth: `${MIN_BAR_PX}px`,
                              }}
                            >
                              {widthPct >= 3 ? (
                                <span className="truncate px-1">
                                  {bar.deliverables > 0
                                    ? formatDeliverablesDisplay(bar.deliverables)
                                    : `${format(bar.start, "d/M")}–${format(bar.end, "d/M")}`}
                                </span>
                              ) : null}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-0.5 text-xs">
                              <p className="font-medium">{row.label}</p>
                              <p>
                                {format(bar.start, "dd MMM yyyy")} - {format(bar.end, "dd MMM yyyy")}
                              </p>
                              <p>Deliverables: {formatDeliverablesDisplay(bar.deliverables)}</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  /* Weekly: fixed column widths + horizontal scroll */
  return (
    <TooltipProvider delayDuration={120}>
      <div
        ref={ref}
        data-export="media-plan-gantt-root"
        className="overflow-x-auto rounded-xl border border-border/60 bg-background/60"
        role="region"
        aria-label={`Campaign media timeline, ${rows.length} rows, ${ariaGranularity}`}
      >
        <div className="min-w-full">
          <div
            className="sticky top-0 z-20 flex border-b border-border/70 bg-background/95 backdrop-blur"
            style={{ width: headerWidthPx }}
          >
            <div className="shrink-0 border-r border-border/70 bg-background/95" style={{ width: LABEL_WIDTH }} />
            <div className="flex" style={{ width: totalWidthPx }}>
              {weeks.map((week, weekIndex) => (
                <div
                  key={weekIndex}
                  className="flex shrink-0 items-center justify-center border-r border-border/40 px-1 py-2 text-center text-xs font-semibold text-foreground last:border-r-0"
                  style={{ width: WEEK_WIDTH }}
                >
                  <span className="line-clamp-2 leading-tight">
                    {format(week[0], "MMM d")} – {format(week[week.length - 1], "MMM d, yyyy")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative" style={{ width: headerWidthPx }}>
            {todayOffset !== null ? (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10 border-l-2 border-dashed border-sky-500/70"
                style={{ left: `${LABEL_WIDTH + dayToXPx(todayOffset)}px` }}
              >
                <span className="absolute -top-2 -translate-x-1/2 rounded-full bg-sky-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Today
                </span>
              </div>
            ) : null}
            {rows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className={cn(
                  "relative flex min-h-[48px] items-center border-b border-border/40",
                  rowIndex % 2 === 1 && "bg-muted/[0.05]"
                )}
              >
                <div className={labelColClass} style={{ width: LABEL_WIDTH }}>
                  <span
                    className="h-6 w-1.5 rounded-full"
                    style={{ backgroundColor: getMediaColor(row.mediaType) }}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-default truncate">{row.label}</div>
                    </TooltipTrigger>
                    <TooltipContent>{row.label}</TooltipContent>
                  </Tooltip>
                </div>
                <div className="relative h-full flex-none" style={{ width: totalWidthPx }}>
                  {row.bars.map((bar, barIndex) => {
                    const left = dayToXPx(bar.startOffset)
                    const width = spanToWPx(bar.width)
                    const barColor = getMediaColor(row.mediaType)

                    return (
                      <Tooltip key={barIndex}>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute top-1/2 flex h-6 -translate-y-1/2 cursor-default items-center justify-center rounded-md border border-black/10 text-xs font-medium text-white shadow-sm transition-transform duration-150 hover:scale-[1.01]"
                            style={{
                              left: `${left}px`,
                              width: `${width}px`,
                              backgroundColor: barColor,
                              minWidth: `${MIN_BAR_PX}px`,
                            }}
                          >
                            {width > 52 && (
                              <span className="truncate px-1">
                                {bar.deliverables > 0
                                  ? formatDeliverablesDisplay(bar.deliverables)
                                  : `${format(bar.start, "d/M")}–${format(bar.end, "d/M")}`}
                              </span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-0.5 text-xs">
                            <p className="font-medium">{row.label}</p>
                            <p>
                              {format(bar.start, "dd MMM yyyy")} - {format(bar.end, "dd MMM yyyy")}
                            </p>
                            <p>Deliverables: {formatDeliverablesDisplay(bar.deliverables)}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
})

export default MediaGanttChart
