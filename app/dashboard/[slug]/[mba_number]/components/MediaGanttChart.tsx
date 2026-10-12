"use client"

import { forwardRef } from "react"

import { MediaGanttChart as LibraryMediaGanttChart } from "@/components/charts/system"
import GroupedMediaGantt from "@/components/dashboard/campaign/GroupedMediaGantt"
import {
  reshapeLineItemsToMediaGantt,
  type MediaGanttGranularity,
} from "@/components/dashboard/campaign/mediaGanttReshape"
import { EmptyState } from "@/components/ui/states"
import type { NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"

export interface MediaGanttChartProps {
  lineItems: Record<string, NormalisedLineItem[]>
  startDate: string
  endDate: string
  granularity?: MediaGanttGranularity
  /** Accordion per-line deliverable actuals. Absent keys stay planned-only. */
  deliveredByLineId?: ReadonlyMap<string, number>
  /** Active bursts in forest, past or future in context. */
  flighting?: boolean
  /**
   * Client flighting groups one summary row per channel.
   * The plan editor leaves this off and keeps one row per line.
   */
  grouped?: boolean
}

const MediaGanttChart = forwardRef<HTMLDivElement, MediaGanttChartProps>(function MediaGanttChart(
  { lineItems, startDate, endDate, granularity = "weekly", deliveredByLineId, flighting = false, grouped = false },
  ref,
) {
  const gantt = reshapeLineItemsToMediaGantt(
    lineItems,
    startDate,
    endDate,
    granularity,
    deliveredByLineId,
    flighting,
  )

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
      className="w-full overflow-visible rounded-card border border-border bg-background"
      role="region"
      aria-label={`Campaign media timeline, ${grouped ? "grouped by channel, " : ""}${gantt.rows.length} ${grouped ? "lines" : "rows"}, ${granularity === "monthly" ? "month view" : "week view"}`}
    >
      {grouped ? (
        <GroupedMediaGantt
          key={`${granularity}:${gantt.rows.length}:${gantt.rows.map((row) => row.channelKey ?? "").join(",")}`}
          rows={gantt.rows}
          weeks={gantt.weeks}
          months={gantt.months}
          weeksPerMonth={gantt.weeksPerMonth}
          monthBands={gantt.monthBands}
          weekLabels={gantt.weekLabels}
          todayWeek={gantt.todayWeek}
        />
      ) : (
        <LibraryMediaGanttChart
          rows={gantt.rows}
          weeks={gantt.weeks}
          months={gantt.months}
          weeksPerMonth={gantt.weeksPerMonth}
          monthBands={gantt.monthBands}
          weekLabels={gantt.weekLabels}
          todayWeek={gantt.todayWeek}
          className="min-w-full"
        />
      )}
    </div>
  )
})

export default MediaGanttChart
