"use client"

import { forwardRef } from "react"

import { MediaGanttChart as LibraryMediaGanttChart } from "@/components/charts/system"
import {
  reshapeLineItemsToMediaGantt,
  type MediaGanttGranularity,
} from "@/components/dashboard/campaign/mediaGanttReshape"
import { EmptyState } from "@/components/ui/states"
import type { NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"
import { cn } from "@/lib/utils"

export interface MediaGanttChartProps {
  lineItems: Record<string, NormalisedLineItem[]>
  startDate: string
  endDate: string
  granularity?: MediaGanttGranularity
}

const MediaGanttChart = forwardRef<HTMLDivElement, MediaGanttChartProps>(function MediaGanttChart(
  { lineItems, startDate, endDate, granularity = "weekly" },
  ref,
) {
  const gantt = reshapeLineItemsToMediaGantt(lineItems, startDate, endDate, granularity)

  if (!gantt) {
    return (
      <div ref={ref}>
        <EmptyState
          title="No timeline data available"
          message="There are no campaign bursts in the selected date window."
        />
      </div>
    )
  }

  return (
    <div
      ref={ref}
      data-export="media-plan-gantt-root"
      className={cn(
        "w-full overflow-x-auto rounded-card border border-border bg-background",
        granularity === "monthly" ? "overflow-hidden" : undefined,
      )}
      role="region"
      aria-label={`Campaign media timeline, ${gantt.rows.length} rows, ${granularity === "monthly" ? "month view" : "week view"}`}
    >
      <LibraryMediaGanttChart
        rows={gantt.rows}
        weeks={gantt.weeks}
        months={gantt.months}
        weeksPerMonth={gantt.weeksPerMonth}
        todayWeek={gantt.todayWeek}
        className="min-w-full"
      />
    </div>
  )
})

export default MediaGanttChart
