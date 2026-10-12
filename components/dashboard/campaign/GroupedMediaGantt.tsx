"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"

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
      {groups.map((group) => {
        const expanded = open[group.channelKey] === true
        const header = summaryRow(group)
        const chartRows = expanded ? [header, ...group.rows] : [header]
        return (
          <section key={group.channelKey || group.label} className="space-y-1">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() =>
                setOpen((current) => ({ ...current, [group.channelKey]: !expanded }))
              }
              className="interactive-tint flex w-full items-center gap-2 rounded-input px-2 py-1.5 text-left"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  expanded ? "rotate-90" : undefined,
                )}
                aria-hidden
              />
              <span className="text-sm font-semibold text-foreground">{group.label}</span>
              <span className="text-xs text-muted-foreground">{group.lineCount} lines</span>
              {group.plannedMedia != null ? (
                <span className="num ml-auto text-xs text-foreground">{formatMoney(group.plannedMedia)}</span>
              ) : null}
            </button>
            <LibraryMediaGanttChart
              rows={chartRows}
              weeks={weeks}
              months={months}
              weeksPerMonth={weeksPerMonth}
              monthBands={monthBands}
              todayWeek={todayWeek}
              className="min-w-full"
            />
          </section>
        )
      })}
    </div>
  )
}
