"use client"

import { useState } from "react"

import { MediaGanttChart as LibraryMediaGanttChart } from "@/components/charts/system"
import type { GanttMonthBand, GanttRow } from "@/components/charts/system"
import { Button } from "@/components/ui/button"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"

import { groupGanttRowsByChannel } from "./groupGanttRowsByChannel"

export type GroupedMediaGanttProps = {
  rows: GanttRow[]
  weeks: number
  months: string[]
  weeksPerMonth: number
  monthBands?: GanttMonthBand[]
  weekLabels?: string[]
  todayWeek?: number | null
  className?: string
}

function summaryRow(group: {
  label: string
  lineCount: number
  start: number
  end: number
  plannedMedia?: number
  rows: GanttRow[]
}): GanttRow {
  const money =
    group.plannedMedia != null ? ` · ${formatMoney(group.plannedMedia)}` : ""
  return {
    label: group.label,
    sub: `${group.lineCount} lines${money}`,
    color: group.rows[0]?.color,
    channelKey: group.rows[0]?.channelKey,
    plannedMedia: group.plannedMedia,
    bursts: [
      {
        startWeek: group.start,
        endWeek: Math.max(group.end, group.start + 1),
      },
    ],
  }
}

export default function GroupedMediaGantt({
  rows,
  weeks,
  months,
  weeksPerMonth,
  monthBands,
  weekLabels,
  todayWeek,
  className,
}: GroupedMediaGanttProps) {
  const { groups, collapsed } = groupGanttRowsByChannel(rows, { collapseAt: 20 })
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((group) => [group.channelKey, !collapsed])),
  )

  const setAll = (expanded: boolean) => {
    setOpen(Object.fromEntries(groups.map((group) => [group.channelKey, expanded])))
  }

  const chartRows: GanttRow[] = []
  for (const group of groups) {
    const expanded = open[group.channelKey] === true
    chartRows.push({
      ...summaryRow(group),
      summary: true,
      expanded,
    })
    if (!expanded) continue
    for (const row of group.rows) {
      chartRows.push({ ...row, indent: true })
    }
  }

  const toggleAt = (index: number) => {
    const row = chartRows[index]
    if (!row?.summary) return
    const key = row.channelKey ?? ""
    setOpen((current) => ({ ...current, [key]: current[key] !== true }))
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAll(true)}>
          Expand all
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAll(false)}>
          Collapse all
        </Button>
      </div>
      <LibraryMediaGanttChart
        rows={chartRows}
        weeks={weeks}
        months={months}
        weeksPerMonth={weeksPerMonth}
        monthBands={monthBands}
        weekLabels={weekLabels}
        todayWeek={todayWeek}
        onToggleSummary={toggleAt}
        className="min-w-full"
      />
    </div>
  )
}
