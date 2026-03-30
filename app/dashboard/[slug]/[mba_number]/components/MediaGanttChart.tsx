"use client"

import { useMemo } from "react"
import { format, eachDayOfInterval, startOfDay, endOfDay, differenceInCalendarDays, parseISO } from "date-fns"
import { NormalisedLineItem, groupByLineItemId } from "@/lib/mediaplan/normalizeLineItem"
import { getMediaColor } from "@/lib/charts/registry"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface MediaGanttChartProps {
  lineItems: Record<string, NormalisedLineItem[]>
  startDate: string
  endDate: string
}

/** Pixel width per week column (no per-day columns). */
const WEEK_WIDTH = 80
const LABEL_WIDTH = 224
const MIN_BAR_PX = 6

function safeNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
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

/** Group consecutive calendar days into Sun-start weeks (same boundary rules as before). */
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

export default function MediaGanttChart({ lineItems, startDate, endDate }: MediaGanttChartProps) {
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
        const publisher = item.publisher || item.platform || item.network || item.site || item.station
        const safeTitle = item.title && !/auto\s*allocation/i.test(item.title) ? item.title : undefined
        const labelLeft = publisher ?? "—"
        const labelRight = safeTitle ?? `Line item ${item.lineItemId || "—"}`
        const label = `${labelLeft} • ${labelRight}`

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
            publisher,
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
    const totalWidth = weeks.length * WEEK_WIDTH

    return { rows, weeks, totalDays, totalWidth, todayOffset }
  }, [lineItems, startDate, endDate])

  if (!ganttData || ganttData.rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No timeline data available
      </div>
    )
  }

  const { rows, weeks, totalDays, totalWidth, todayOffset } = ganttData
  const headerWidth = totalWidth + LABEL_WIDTH

  const dayToX = (dayOffset: number) => (dayOffset / totalDays) * totalWidth
  const spanToW = (spanDays: number) => Math.max(MIN_BAR_PX, (spanDays / totalDays) * totalWidth)

  return (
    <TooltipProvider delayDuration={120}>
      <div
        className="overflow-x-auto rounded-xl border border-border/60 bg-background/60"
        role="region"
        aria-label={`Campaign media timeline, ${rows.length} rows, week view`}
      >
        <div className="min-w-full">
          <div
            className="sticky top-0 z-20 flex border-b border-border/70 bg-background/95 backdrop-blur"
            style={{ width: headerWidth }}
          >
            <div className="shrink-0 border-r border-border/70 bg-background/95" style={{ width: LABEL_WIDTH }} />
            <div className="flex" style={{ width: totalWidth }}>
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

          <div className="relative">
            {todayOffset !== null ? (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10 border-l-2 border-dashed border-sky-500/70"
                style={{ left: `${LABEL_WIDTH + dayToX(todayOffset)}px` }}
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
                  "relative flex min-h-[56px] items-center border-b border-border/40",
                  rowIndex % 2 === 1 && "bg-muted/[0.05]"
                )}
              >
                <div
                  className="flex shrink-0 items-center gap-2 border-r border-border/50 p-2 text-sm font-medium"
                  style={{ width: LABEL_WIDTH }}
                >
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
                <div className="relative h-full flex-none" style={{ width: totalWidth }}>
                  {row.bars.map((bar, barIndex) => {
                    const left = dayToX(bar.startOffset)
                    const width = spanToW(bar.width)
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
                                  ? bar.deliverables.toLocaleString()
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
                            <p>Deliverables: {bar.deliverables.toLocaleString()}</p>
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
