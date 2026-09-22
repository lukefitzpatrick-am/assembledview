"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { MetricCard } from "@/components/ui/MetricCard"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatMoney, formatPercent } from "@/lib/format/money"
import { formatCount } from "@/lib/pacing/channel/lineCardFormat"
import { lineDaysLeft } from "@/lib/pacing/channel/lineCardPace"
import type { LineCardModel, LineCardPace } from "@/lib/pacing/channel/lineCardTypes"
import { burstWhyClause, lineWhySentence } from "@/lib/pacing/channel/lineCardWhy"
import {
  burstAxisRange,
  burstFillPct,
  NO_BURSTS_BOOKED,
  overlappingBurstRows,
  pctAlong,
} from "@/lib/pacing/detail/burstsFromLines"
import { KPI_NOT_TRACKED_FOR_SOURCE } from "@/lib/pacing/detail/kpisFromLines"
import { lineDetailDescription } from "@/lib/pacing/detail/lineDetailColumns"
import type { CampaignDetailBurst, CampaignDetailDailyWindow } from "@/lib/pacing/detail/types"
import { cn } from "@/lib/utils"

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return formatMoney(value, { decimals: 0 })
}

function paceLabel(pace: LineCardPace): string {
  if (pace === "on_track") return "On track"
  if (pace === "over_pacing") return "Over"
  if (pace === "no_data") return "Not started"
  if (pace === "ahead") return "On track"
  return pace.replace("_", " ")
}

function burstFillClass(status: LineCardPace): string {
  if (status === "ahead") return "bg-pacing-ahead"
  if (status === "on_track") return "bg-pacing-on-track"
  if (status === "behind") return "bg-pacing-behind"
  if (status === "over_pacing") return "bg-pacing-critical"
  return "bg-muted-foreground/40"
}

function formatRange(start: string, end: string): string {
  return `${start} – ${end}`
}

function daysElapsedInBurst(start: string, end: string, asOf: string): number {
  const until = asOf < start ? start : asOf > end ? end : asOf
  const startMs = Date.parse(`${start}T00:00:00Z`)
  const untilMs = Date.parse(`${until}T00:00:00Z`)
  if (!Number.isFinite(startMs) || !Number.isFinite(untilMs) || untilMs < startMs) return 0
  return Math.round((untilMs - startMs) / 86_400_000) + 1
}

function leadKpi(line: LineCardModel, burst: CampaignDetailBurst): { label: string; delivered: string; target: string } | null {
  const kpi = line.kpis.find((item) => item.delivered !== KPI_NOT_TRACKED_FOR_SOURCE)
  if (!kpi) return null
  const label = kpi.label.toLowerCase()
  let delivered = kpi.delivered
  if (label === "ctr" && burst.impressions > 0) {
    delivered = formatPercent((burst.clicks / burst.impressions) * 100, { decimals: 2 })
  } else if (label === "cpc" && burst.clicks > 0) {
    delivered = formatMoney(burst.spend / burst.clicks, { decimals: 2 })
  } else if (label === "cpm" && burst.impressions > 0) {
    delivered = formatMoney((burst.spend / burst.impressions) * 1000, { decimals: 2 })
  } else if (label.includes("impression")) {
    delivered = formatCount(burst.impressions)
  } else if (label.includes("click")) {
    delivered = formatCount(burst.clicks)
  }
  return { label: kpi.label, delivered, target: kpi.target || "No target set" }
}

function whyForBurst(line: LineCardModel, burst: CampaignDetailBurst, asOf: string): string {
  const daysLeft = lineDaysLeft(burst.start, burst.end, asOf)
  const clause = burstWhyClause({
    burstStart: burst.start,
    burstPct: burst.pct,
    daysLeft,
  })
  return lineWhySentence({
    pace: burst.status,
    platform: line.platform,
    linePct: burst.pct,
    daysElapsed: daysElapsedInBurst(burst.start, burst.end, asOf),
    daysLeft,
    spend: burst.spend,
    budget: burst.budget,
    projectedFinish: null,
    perDayLeft: burst.perDayLeft,
    perDayPlan: null,
    sourceState: line.sourceState,
    burstClause: clause,
  })
}

export function CampaignBurstsTab({
  lines,
  bursts,
  asOf,
  campaignStart,
  campaignEnd,
  onPlanScenario,
  onDailyWindow,
}: {
  lines: readonly LineCardModel[]
  bursts: readonly CampaignDetailBurst[]
  asOf: string
  campaignStart?: string | null
  campaignEnd?: string | null
  onPlanScenario: (input: { lineItemId: string; date_from: string; date_to: string }) => void
  onDailyWindow: (window: CampaignDetailDailyWindow) => void
}) {
  const [channelFilter, setChannelFilter] = useState("all")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const counts = useMemo(() => {
    const byChannel = new Map<string, number>()
    for (const line of lines) {
      byChannel.set(line.channel, (byChannel.get(line.channel) ?? 0) + 1)
    }
    return byChannel
  }, [lines])

  const visibleLines = useMemo(
    () => (channelFilter === "all" ? [...lines] : lines.filter((line) => line.channel === channelFilter)),
    [lines, channelFilter],
  )

  const axis = burstAxisRange(bursts, asOf, campaignStart, campaignEnd)
  const todayPct = pctAlong(asOf, axis.start, axis.end)
  const selected = bursts.find((burst) => `${burst.lineItemId}:${burst.index}` === selectedKey && !burst.empty) ?? null
  const selectedLine = selected ? lines.find((line) => line.lineItemId === selected.lineItemId) : null
  const overlap = selected
    ? overlappingBurstRows(bursts, { start: selected.start, end: selected.end }, selected.lineItemId)
    : []
  const totals = overlap.reduce(
    (acc, row) => {
      acc.budget += row.budget
      acc.spend += row.spend
      acc.impressions += row.impressions
      acc.clicks += row.clicks
      return acc
    },
    { budget: 0, spend: 0, impressions: 0, clicks: 0 },
  )

  if (selected && selectedLine) {
    const kpi = leadKpi(selectedLine, selected)
    const elapsed = daysElapsedInBurst(selected.start, selected.end, asOf)
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {selected.lineItemId} · {selected.name} ({formatRange(selected.start, selected.end)})
          </h3>
          <Button type="button" size="sm" variant="outline" onClick={() => setSelectedKey(null)}>
            Back to all bursts
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard size="sm" label="Burst budget" value={money(selected.budget)} />
          <MetricCard
            size="sm"
            label="Spend in window"
            value={money(selected.spend)}
            unit={`${formatPercent(selected.pct, { decimals: 0 })} · ${paceLabel(selected.status)}`}
          />
          <MetricCard
            size="sm"
            label="Expected by today"
            value={money(selected.expected)}
            unit={`${elapsed} days`}
          />
          <MetricCard size="sm" label="Per-day left" value={money(selected.perDayLeft)} />
          <MetricCard
            size="sm"
            label={kpi?.label ?? "Lead KPI"}
            value={kpi ? `${kpi.delivered} vs ${kpi.target}` : "—"}
          />
        </div>
        <p className="text-sm text-muted-foreground">{whyForBurst(selectedLine, selected, asOf)}</p>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Line</th>
                <th className="py-2 pr-3">Burst in this window</th>
                <th className="num py-2 pr-3 text-right">Budget</th>
                <th className="num py-2 pr-3 text-right">Spend</th>
                <th className="num py-2 pr-3 text-right">Pace</th>
                <th className="num py-2 pr-3 text-right">Impressions</th>
                <th className="num py-2 pr-3 text-right">Clicks</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {overlap.map((row) => (
                <tr key={`${row.lineItemId}:${row.index}`} className="border-t border-border">
                  <td className="py-2 pr-3 font-mono text-xs">{row.lineItemId}</td>
                  <td className="py-2 pr-3">{row.name}</td>
                  <td className="num py-2 pr-3 text-right">{money(row.budget)}</td>
                  <td className="num py-2 pr-3 text-right">{money(row.spend)}</td>
                  <td className="num py-2 pr-3 text-right">{formatPercent(row.pct, { decimals: 0 })}</td>
                  <td className="num py-2 pr-3 text-right">{formatCount(row.impressions)}</td>
                  <td className="num py-2 pr-3 text-right">{formatCount(row.clicks)}</td>
                  <td className="py-2">{paceLabel(row.status)}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className="py-2 pr-3" colSpan={2}>
                  Campaign total
                </td>
                <td className="num py-2 pr-3 text-right">{money(totals.budget)}</td>
                <td className="num py-2 pr-3 text-right">{money(totals.spend)}</td>
                <td className="num py-2 pr-3 text-right">
                  {totals.budget > 0
                    ? formatPercent((totals.spend / totals.budget) * 100, { decimals: 0 })
                    : "—"}
                </td>
                <td className="num py-2 pr-3 text-right">{formatCount(totals.impressions)}</td>
                <td className="num py-2 pr-3 text-right">{formatCount(totals.clicks)}</td>
                <td className="py-2" />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() =>
              onPlanScenario({
                lineItemId: selected.lineItemId,
                date_from: selected.start,
                date_to: selected.end,
              })
            }
          >
            Plan a scenario for this burst
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onDailyWindow({ date_from: selected.start, date_to: selected.end })}
          >
            Daily view this window
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedKey(null)}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={channelFilter === "all" ? "default" : "outline"}
          onClick={() => setChannelFilter("all")}
        >
          All lines ({lines.length})
        </Button>
        {[...counts.entries()].toSorted(([a], [b]) => a.localeCompare(b)).map(([channel, count]) => (
          <Button
            key={channel}
            type="button"
            size="sm"
            variant={channelFilter === channel ? "default" : "outline"}
            onClick={() => setChannelFilter(channel)}
          >
            {channel} ({count})
          </Button>
        ))}
      </div>
      <TooltipProvider>
        <div className="space-y-3">
          {visibleLines.map((line) => {
            const segments = bursts.filter((burst) => burst.lineItemId === line.lineItemId)
            const description = lineDetailDescription(line)
            return (
              <div
                key={line.lineItemId}
                data-burst-lane
                className="grid grid-cols-[11rem_1fr] items-center gap-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs text-foreground">{line.lineItemId}</p>
                  <p className="truncate text-xs text-muted-foreground" title={description}>
                    {description}
                  </p>
                </div>
                <div className="relative h-7 rounded-pill bg-fill-track">
                  {segments.map((burst) => {
                    if (burst.empty) {
                      return (
                        <span
                          key={`${burst.lineItemId}:empty`}
                          className="absolute inset-0 flex items-center px-2 text-xs text-muted-foreground"
                        >
                          {NO_BURSTS_BOOKED}
                        </span>
                      )
                    }
                    const left = pctAlong(burst.start, axis.start, axis.end)
                    const right = pctAlong(burst.end, axis.start, axis.end)
                    const width = Math.max(2, right - left)
                    const fill = burstFillPct(burst.spend, burst.budget)
                    return (
                      <Tooltip key={`${burst.lineItemId}:${burst.index}`}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="absolute top-0 h-full overflow-hidden rounded-pill text-left"
                            style={{ left: `${left}%`, width: `${width}%` }}
                            onClick={() => setSelectedKey(`${burst.lineItemId}:${burst.index}`)}
                          >
                            <span className="absolute inset-0 rounded-pill bg-fill-track" />
                            <span
                              className={cn("absolute inset-y-0 left-0 rounded-pill", burstFillClass(burst.status))}
                              style={{ width: `${fill}%` }}
                            />
                            <span className="relative z-10 truncate px-1.5 text-[10px] leading-7 text-foreground">
                              {burst.name} · {formatPercent(burst.pct, { decimals: 0 })}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs space-y-1 text-xs">
                          <p>
                            {burst.name}: {formatRange(burst.start, burst.end)}
                          </p>
                          <p>Budget {money(burst.budget)}</p>
                          <p>Spend {money(burst.spend)}</p>
                          <p>Expected by today {money(burst.expected)}</p>
                          <p>
                            Deliverable {formatCount(burst.deliveredDeliverable)} /{" "}
                            {formatCount(burst.plannedDeliverable)}
                          </p>
                          <p>Per-day left {money(burst.perDayLeft)}</p>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                  <span
                    className="pointer-events-none absolute top-[-4px] h-9 w-px border-l border-dashed border-foreground"
                    style={{ left: `${todayPct}%` }}
                    aria-label="Today"
                  />
                </div>
              </div>
            )
          })}
        </div>
      </TooltipProvider>
    </div>
  )
}
