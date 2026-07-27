"use client"

import type { OverviewStatusCounts } from "@/lib/pacing/overview/types"

export function PacingStatusSummary({ counts }: { counts: OverviewStatusCounts }) {
  const items: Array<{ label: string; value: number; tone: string }> = [
    { label: "Behind", value: counts.behind, tone: "text-status-behind-fg" },
    { label: "On track", value: counts.onTrack, tone: "text-status-on-track-fg" },
    { label: "Ahead", value: counts.ahead, tone: "text-status-ahead-fg" },
    { label: "Over-pacing", value: counts.overPacing, tone: "text-status-critical-fg" },
    { label: "No data", value: counts.noData, tone: "text-muted-foreground" },
    { label: "KPI Pending", value: counts.kpiPending, tone: "text-muted-foreground" },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 rounded-card border border-border bg-card p-3 shadow-e0 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {item.label}
          </span>
          <span className={`num text-lg font-semibold ${item.tone}`}>{item.value}</span>
        </div>
      ))}
    </div>
  )
}
