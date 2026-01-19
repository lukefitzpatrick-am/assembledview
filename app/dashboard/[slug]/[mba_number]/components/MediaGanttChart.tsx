"use client"

import { useMemo } from 'react'
import { format, eachDayOfInterval, startOfDay, endOfDay, differenceInCalendarDays, parseISO } from 'date-fns'
import { NormalisedLineItem, groupByLineItemId } from '@/lib/mediaplan/normalizeLineItem'

interface MediaGanttChartProps {
  lineItems: Record<string, NormalisedLineItem[]>
  startDate: string
  endDate: string
}

// Excel gantt chart color: #FFD02A60 (pink/magenta)
const GANTT_COLOR = '#D02A60'
const DAY_WIDTH = 40
const LABEL_WIDTH = 224

function safeNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
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

export default function MediaGanttChart({ lineItems, startDate, endDate }: MediaGanttChartProps) {
  const ganttData = useMemo(() => {
    const safeStart = safeParseDate(startDate)
    const safeEnd = safeParseDate(endDate)
    if (!safeStart || !safeEnd) return null

    const start = startOfDay(safeStart)
    const end = endOfDay(safeEnd)

    // Generate all days in the campaign range
    const allDays = eachDayOfInterval({ start, end })
    
    // Process line items
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
        const labelLeft = publisher ?? '—'
        const labelRight = safeTitle ?? `Line item ${item.lineItemId || '—'}`
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

    return { rows, days: allDays }
  }, [lineItems, startDate, endDate])

  if (!ganttData || ganttData.rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No timeline data available
      </div>
    )
  }

  const { rows, days } = ganttData
  const totalWidth = days.length * DAY_WIDTH
  const headerWidth = totalWidth + LABEL_WIDTH

  // Group by weeks (Sunday to Saturday)
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

  return (
    <div className="overflow-x-auto">
      <div className="min-w-full">
        {/* Header with dates */}
        <div className="flex border-b" style={{ width: headerWidth }}>
          <div className="shrink-0 border-r bg-gray-50" style={{ width: LABEL_WIDTH }} />
          <div className="flex" style={{ width: totalWidth }}>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="border-r last:border-r-0" style={{ width: week.length * DAY_WIDTH }}>
                <div className="text-xs font-semibold text-center p-2 border-b bg-gray-50">
                  {format(week[0], 'MMM d')} - {format(week[week.length - 1], 'MMM d, yyyy')}
                </div>
                <div className="flex">
                  {week.map((day) => (
                    <div
                      key={day.toISOString()}
                      className="shrink-0 text-xs text-center p-1 border-r last:border-r-0"
                      style={{ width: DAY_WIDTH }}
                    >
                      {format(day, 'd')}
                      <div className="text-[10px] text-muted-foreground">
                        {format(day, 'EEE')[0]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gantt bars */}
        <div className="relative">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="border-b min-h-[56px] flex items-center relative">
            <div className="p-2 text-sm font-medium border-r bg-gray-50 shrink-0" style={{ width: LABEL_WIDTH }}>
              <div className="truncate" title={row.label}>
                {row.label}
              </div>
            </div>
              <div className="relative h-full flex-none" style={{ width: totalWidth }}>
                {row.bars.map((bar, barIndex) => {
                  const left = bar.startOffset * DAY_WIDTH
                  const width = bar.width * DAY_WIDTH

                  return (
                    <div
                      key={barIndex}
                      className="absolute top-1/2 -translate-y-1/2 h-6 rounded flex items-center justify-center text-white text-xs font-medium border border-white/20"
                      style={{
                        left: `${left}px`,
                        width: `${width}px`,
                        backgroundColor: GANTT_COLOR,
                        minWidth: '20px'
                      }}
                      title={`${format(bar.start, 'dd/MM/yyyy')} - ${format(bar.end, 'dd/MM/yyyy')}\nDeliverables: ${bar.deliverables.toLocaleString()}`}
                    >
                      {width > 60 && (
                        <span className="truncate px-1">
                          {bar.deliverables > 0 ? bar.deliverables.toLocaleString() : format(bar.start, 'd/M')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
