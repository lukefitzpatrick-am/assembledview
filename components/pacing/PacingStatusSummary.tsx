"use client"

import type { OverviewStatusCounts } from "@/lib/pacing/overview/types"
import { pacingStatusFromBand, kpiStatusPresentation } from "@/lib/pacing/status"
import { StatusLegend } from "@/components/pacing/StatusLegend"

export function PacingStatusSummary({ counts }: { counts: OverviewStatusCounts }) {
  const behind = pacingStatusFromBand("behind")
  const onTrack = pacingStatusFromBand("on-track")
  const ahead = pacingStatusFromBand("ahead")
  const over = pacingStatusFromBand("over-pacing")
  const noData = pacingStatusFromBand("no-data")
  const kpiPending = kpiStatusPresentation("kpi-pending")

  const items: Array<{ label: string; value: number; tone: string }> = [
    { label: behind.label, value: counts.behind, tone: behind.textClass },
    { label: onTrack.label, value: counts.onTrack, tone: onTrack.textClass },
    { label: ahead.label, value: counts.ahead, tone: ahead.textClass },
    { label: over.label, value: counts.overPacing, tone: over.textClass },
    { label: noData.label, value: counts.noData, tone: noData.textClass },
    {
      label: kpiPending.label,
      value: counts.kpiPending,
      tone:
        kpiPending.role === "ok"
          ? "text-status-on-track-fg"
          : kpiPending.role === "problem"
            ? "text-status-critical-fg"
            : "text-status-attention-fg",
    },
  ]
  return (
    <div className="space-y-2">
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
      <StatusLegend />
    </div>
  )
}
