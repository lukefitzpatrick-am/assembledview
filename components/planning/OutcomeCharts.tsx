"use client"

import { useMemo, useRef, useState } from "react"
import {
  BaseChartCard,
  ChartExportToolbar,
  ComboChart,
  GroupedBarChart,
  HorizontalBarChart,
  ScatterChart,
  exportCsv,
  exportPng,
  type ScatterPoint,
} from "@/components/charts/system"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { dfii, dfiiTone, dfiiToneClass } from "@/lib/planning/dfii"
import { cn } from "@/lib/utils"
import type { AudienceCompareBundle } from "./StageCompare"
import { AUDIENCE_ACCENTS } from "./constants"
import { formatAudienceWc } from "./robustness"

const ALL_AUDIENCES = "__all__"
const ADDR_GAP_PTS = 2

type OutcomeChartsProps = {
  bundles?: AudienceCompareBundle[]
  onOpenMethodology?: (focusId?: string) => void
  /**
   * Client dashboard mode: reach × index only — no DFII / cost / benchmark badges.
   * 18+ honesty badge stays. Hides other chart suite members.
   */
  clientSafe?: boolean
  /** Preset rows for clientSafe dashboard (from by-mba whitelist payload). */
  reachIndexPreset?: Array<{ channel: string; reach_pct: number; affinity_index: number }>
  audienceLabel?: string
  accentColor?: string
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].toSorted((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  }
  return sorted[mid] ?? 0
}

function DfiiValue({ value }: { value: number | null }) {
  const tone = dfiiTone(value)
  return (
    <span
      className={cn(
        "num inline-flex min-w-[2rem] items-center justify-center rounded-pill px-2 py-0.5 text-xs font-medium",
        dfiiToneClass(tone)
      )}
    >
      {value == null ? "—" : value}
    </span>
  )
}

export function OutcomeCharts({
  bundles = [],
  onOpenMethodology,
  clientSafe = false,
  reachIndexPreset,
  audienceLabel = "Audience",
  accentColor,
}: OutcomeChartsProps) {
  const ready = bundles.filter((b) => b.scored.length > 0)
  const [audienceKey, setAudienceKey] = useState<string>(
    () => ready[0]?.draft.id ?? ALL_AUDIENCES
  )
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const reachRef = useRef<HTMLDivElement>(null)
  const scatterRef = useRef<HTMLDivElement>(null)
  const dfiiRef = useRef<HTMLDivElement>(null)
  const addrRef = useRef<HTMLDivElement>(null)

  const activeBundle =
    audienceKey === ALL_AUDIENCES
      ? null
      : ready.find((b) => b.draft.id === audienceKey) ?? ready[0] ?? null

  const comparison = !clientSafe && audienceKey === ALL_AUDIENCES && ready.length > 1

  const presetReachData = useMemo(() => {
    if (!reachIndexPreset?.length) return null
    const color = accentColor ?? AUDIENCE_ACCENTS[0]!.cssVar
    const rows = reachIndexPreset
      .map((p) => ({
        channel: p.channel,
        reach_a: p.reach_pct,
        index_a: p.affinity_index,
      }))
      .toSorted((a, b) => b.reach_a - a.reach_a)
    return {
      rows,
      bars: [{ key: "reach_a", label: `${audienceLabel} reach %`, color, format: "number" as const }],
      lines: [{ key: "index_a", label: `${audienceLabel} index`, color, format: "number" as const }],
    }
  }, [reachIndexPreset, audienceLabel, accentColor])

  const reachIndexData = useMemo(() => {
    if (presetReachData) return presetReachData
    const sources = comparison ? ready : activeBundle ? [activeBundle] : []
    if (sources.length === 0) return { rows: [] as Record<string, string | number>[], bars: [], lines: [] }

    const channelMap = new Map<
      string,
      { name: string; baseReach: number; values: Record<string, number> }
    >()

    for (const b of sources) {
      for (const s of b.scored) {
        if (!s.ch.isRmMeasured) continue
        const reach = Math.round(s.ch.reachPct * 1000) / 10
        const index = Math.round(s.affAvg)
        const existing = channelMap.get(s.ch.id)
        if (!existing) {
          channelMap.set(s.ch.id, {
            name: s.ch.name,
            baseReach: reach,
            values: {
              [`reach_${b.draft.id}`]: reach,
              [`index_${b.draft.id}`]: index,
            },
          })
        } else {
          existing.values[`reach_${b.draft.id}`] = reach
          existing.values[`index_${b.draft.id}`] = index
          existing.baseReach = Math.max(existing.baseReach, reach)
        }
      }
    }

    const rows = [...channelMap.entries()]
      .map(([id, meta]) => ({
        channel: meta.name,
        channelId: id,
        ...meta.values,
        _sort: meta.baseReach,
      }))
      .toSorted((a, b) => b._sort - a._sort)
      .map(({ _sort: _, ...rest }) => rest)

    const bars = sources.map((b) => ({
      key: `reach_${b.draft.id}`,
      label: `${b.draft.name} reach %`,
      color: AUDIENCE_ACCENTS[b.draft.colorIndex]!.cssVar,
      format: "number" as const,
    }))
    const lines = sources.map((b) => ({
      key: `index_${b.draft.id}`,
      label: `${b.draft.name} index`,
      color: AUDIENCE_ACCENTS[b.draft.colorIndex]!.cssVar,
      format: "number" as const,
    }))

    return { rows, bars, lines }
  }, [activeBundle, comparison, ready, presetReachData])

  const highlightDetail = useMemo(() => {
    if (!highlighted || clientSafe) {
      if (!highlighted || !reachIndexPreset) return null
      const hit = reachIndexPreset.find((p) => p.channel === highlighted)
      if (!hit) return null
      return {
        channel: highlighted,
        parts: [
          {
            audience: audienceLabel,
            colorIndex: 0 as const,
            reachWc: 0,
            reachPct: hit.reach_pct,
            index: hit.affinity_index,
            dfii: null as number | null,
            isRm: true,
            isBench: false,
            ageBase: 14,
            addr: null as number | null,
            total: null as number | null,
          },
        ],
      }
    }
    const sources = comparison ? ready : activeBundle ? [activeBundle] : []
    const parts = sources.map((b) => {
      const scored = b.scored.find((s) => s.ch.name === highlighted || s.ch.id === highlighted)
      if (!scored) return null
      const dfiiVals = dfii(b.scored.map((s) => ({ bcs: s.bcs })))
      const idx = b.scored.indexOf(scored)
      const adapted = b.adapted?.channels.find((c) => c.id === scored.ch.id)
      return {
        audience: b.draft.name,
        colorIndex: b.draft.colorIndex,
        reachWc: scored.ch.reachWc ?? 0,
        reachPct: Math.round(scored.ch.reachPct * 1000) / 10,
        index: Math.round(scored.affAvg),
        dfii: dfiiVals[idx] ?? null,
        isRm: scored.ch.isRmMeasured,
        isBench: !scored.ch.isRmMeasured,
        ageBase: scored.ch.ageBase,
        addr: adapted ? Math.round(adapted.reachPctAddressable * 1000) / 10 : null,
        total: adapted ? Math.round(adapted.reachPctTotal * 1000) / 10 : null,
      }
    }).filter(Boolean)
    return parts.length ? { channel: highlighted, parts } : null
  }, [
    highlighted,
    comparison,
    ready,
    activeBundle,
    clientSafe,
    reachIndexPreset,
    audienceLabel,
  ])

  const scatterData = useMemo((): ScatterPoint[] => {
    const sources = comparison ? ready : activeBundle ? [activeBundle] : []
    const points: ScatterPoint[] = []
    for (const b of sources) {
      const color = AUDIENCE_ACCENTS[b.draft.colorIndex]!.cssVar
      const dfiiVals = dfii(b.scored.map((s) => ({ bcs: s.bcs })))
      b.scored.forEach((s, i) => {
        if (!s.ch.isRmMeasured) return
        points.push({
          id: `${b.draft.id}:${s.ch.id}`,
          x: Math.round(s.ch.reachPct * 1000) / 10,
          y: Math.round(s.affAvg),
          z: dfiiVals[i] ?? 100,
          label: s.ch.name,
          color,
        })
      })
    }
    return points
  }, [activeBundle, comparison, ready])

  const medianReach = useMemo(
    () => median(scatterData.map((p) => p.x)),
    [scatterData]
  )

  const dfiiBarData = useMemo(() => {
    const b = activeBundle ?? ready[0]
    if (!b) return []
    const vals = dfii(b.scored.map((s) => ({ bcs: s.bcs })))
    return b.scored
      .map((s, i) => ({
        channel: s.ch.name,
        dfii: vals[i] ?? 0,
        isBench: !s.ch.isRmMeasured,
      }))
      .filter((r) => r.dfii > 0)
      .toSorted((a, b) => b.dfii - a.dfii)
  }, [activeBundle, ready])

  const addrData = useMemo(() => {
    const b = activeBundle ?? ready[0]
    if (!b?.adapted) return []
    return b.adapted.channels
      .filter((c) => c.isRmMeasured)
      .map((c) => {
        const addr = Math.round(c.reachPctAddressable * 1000) / 10
        const total = Math.round(c.reachPctTotal * 1000) / 10
        return {
          channel: c.name,
          addressable: addr,
          total,
          gap: Math.abs(total - addr),
        }
      })
      .filter((r) => r.gap > ADDR_GAP_PTS)
      .toSorted((a, b) => b.gap - a.gap)
  }, [activeBundle, ready])

  if (!clientSafe && ready.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No scored channels yet — complete audiences and wait for profiles.
      </p>
    )
  }

  if (clientSafe && !reachIndexData.rows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No reach profile available for this audience yet.
      </p>
    )
  }

  const chipAudience =
    audienceKey === ALL_AUDIENCES ? null : activeBundle ?? ready[0]

  return (
    <div className="space-y-6">
      {!clientSafe ? (
      <div className="flex flex-wrap items-center gap-2">
        {ready.length > 1 ? (
          <button
            type="button"
            onClick={() => setAudienceKey(ALL_AUDIENCES)}
            className={cn(
              "rounded-pill border px-3 py-1 text-xs font-medium transition-colors",
              audienceKey === ALL_AUDIENCES
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            All audiences
          </button>
        ) : null}
        {ready.map((b) => {
          const accent = AUDIENCE_ACCENTS[b.draft.colorIndex]!
          const active = audienceKey === b.draft.id
          return (
            <button
              key={b.draft.id}
              type="button"
              onClick={() => setAudienceKey(b.draft.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-transparent text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              )}
              style={active ? { background: accent.cssVar } : undefined}
            >
              <span className={cn("h-2 w-2 rounded-full", accent.bg)} />
              {b.draft.name}
            </button>
          )
        })}
        {onOpenMethodology ? (
          <button
            type="button"
            onClick={() => onOpenMethodology("dfii")}
            className="ml-auto text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            DFII methodology →
          </button>
        ) : null}
      </div>
      ) : null}

      <div className="space-y-1.5">
      <div data-export="reach-index">
      <BaseChartCard
        title="Reach × Index"
        subtitle={
          clientSafe
            ? "Weekly reach % with affinity index · sorted by reach"
            : "Grouped weekly reach % with affinity index overlay · sorted by reach"
        }
        bodyRef={reachRef}
        toolbar={
          <ChartExportToolbar
            onCsv={() => exportCsv(reachIndexData.rows, "reach-index.csv")}
            onPng={() => void exportPng(reachRef.current, "reach-index.png")}
          />
        }
      >
        {reachIndexData.rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No RM-measured channels.</p>
        ) : (
          <Popover open={detailOpen && !!highlightDetail} onOpenChange={setDetailOpen}>
            <PopoverTrigger asChild>
              <div>
                <ComboChart
                  data={reachIndexData.rows}
                  xKey="channel"
                  bars={reachIndexData.bars}
                  lines={reachIndexData.lines}
                  barFormat="number"
                  lineFormat="number"
                  referenceLines={[
                    { yAxisId: "r", value: 100, label: "Index 100", strokeDasharray: "4 4" },
                  ]}
                  highlightedCategory={highlighted}
                  onCategoryClick={(cat) => {
                    setHighlighted(cat)
                    setDetailOpen(true)
                  }}
                  className="h-[320px] w-full"
                />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-2" align="start">
              {highlightDetail ? (
                <>
                  <p className="text-sm font-medium">{highlightDetail.channel}</p>
                  {highlightDetail.parts.map((p) =>
                    p ? (
                      <div key={p.audience} className="space-y-1 border-t border-border pt-2 text-xs">
                        <p className="font-medium">{p.audience}</p>
                        <p className="text-muted-foreground">
                          Reach{" "}
                          {clientSafe || !p.reachWc ? (
                            <span className="num text-foreground">{p.reachPct}%</span>
                          ) : (
                            <>
                              <span className="num text-foreground">
                                {formatAudienceWc(p.reachWc)}
                              </span>
                              &apos;000s ({p.reachPct}%)
                            </>
                          )}
                        </p>
                        <p className="text-muted-foreground">
                          Index <span className="num text-foreground">{p.index}</span>
                          {!clientSafe ? (
                            <>
                              {" · "}
                              DFII <DfiiValue value={p.dfii} />
                            </>
                          ) : null}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {p.isRm ? (
                            <Badge variant="outline" size="sm">
                              18+ / RM
                            </Badge>
                          ) : null}
                          {!clientSafe && p.isBench ? (
                            <Badge variant="outline" size="sm">
                              Benchmark
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    ) : null
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setHighlighted(null)
                      setDetailOpen(false)
                    }}
                  >
                    Clear highlight
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Click a channel bar for detail.</p>
              )}
            </PopoverContent>
          </Popover>
        )}
      </BaseChartCard>
      {!clientSafe ? (
        <p className="text-[11px] text-muted-foreground">
          Search is modelled from benchmarks (no RM reach) — see DFII ranked and the
          recommended split for Search.
        </p>
      ) : null}
      </div>
      </div>

      {!clientSafe ? (
        <>
      <div data-export="reach-index-quadrant">
      <BaseChartCard
        title="Reach × Index quadrant"
        subtitle="Point size = DFII · guides at median reach and index 100"
        bodyRef={scatterRef}
        toolbar={
          <ChartExportToolbar
            onCsv={() =>
              exportCsv(
                scatterData.map((p) => ({
                  channel: p.label,
                  reach: p.x,
                  index: p.y,
                  dfii: p.z,
                })),
                "reach-index-scatter.csv"
              )
            }
            onPng={() => void exportPng(scatterRef.current, "reach-index-scatter.png")}
          />
        }
      >
        {scatterData.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No points to plot.</p>
        ) : (
          <ScatterChart
            data={scatterData}
            xLabel="Reach %"
            yLabel="Affinity index"
            xFormat="number"
            yFormat="number"
            xReference={medianReach}
            yReference={100}
            quadrantLabels={{
              topRight: "Power channels",
              topLeft: "Niche amplifiers",
              bottomRight: "Mass baseline",
              bottomLeft: "Deprioritise",
            }}
            className="h-[320px] w-full"
          />
        )}
      </BaseChartCard>
      </div>

      <div data-export="dfii-ranked">
      <BaseChartCard
        title="DFII ranked"
        subtitle={
          chipAudience
            ? `${chipAudience.draft.name} · reference line at 100`
            : "Select an audience · reference line at 100"
        }
        bodyRef={dfiiRef}
        toolbar={
          <ChartExportToolbar
            onCsv={() => exportCsv(dfiiBarData, "dfii-ranked.csv")}
            onPng={() => void exportPng(dfiiRef.current, "dfii-ranked.png")}
          />
        }
      >
        {audienceKey === ALL_AUDIENCES && ready.length > 1 ? (
          <p className="mb-2 text-xs text-muted-foreground">
            Showing {ready[0]?.draft.name} — pick an audience chip for a single-audience ranking.
          </p>
        ) : null}
        {dfiiBarData.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No DFII scores.</p>
        ) : (
          <div className="space-y-2">
            <HorizontalBarChart
              data={dfiiBarData.map(({ channel, dfii: v }) => ({ channel, dfii: v }))}
              xKey="channel"
              series={[
                {
                  key: "dfii",
                  label: "DFII",
                  color: AUDIENCE_ACCENTS[(chipAudience ?? ready[0])!.draft.colorIndex]!.cssVar,
                },
              ]}
              valueFormat="number"
              referenceLines={[{ value: 100, label: "100" }]}
              className="h-[360px] w-full"
            />
            <div className="flex flex-wrap gap-1.5">
              {dfiiBarData
                .filter((r) => r.isBench)
                .map((r) => (
                  <Badge key={r.channel} variant="outline" size="sm" className="font-normal">
                    {r.channel} · benchmark
                  </Badge>
                ))}
            </div>
          </div>
        )}
      </BaseChartCard>
      </div>

      <BaseChartCard
        title="Addressable vs Total reach"
        subtitle={
          chipAudience
            ? `${chipAudience.draft.name} · channels with >${ADDR_GAP_PTS}pt gap`
            : `Channels with >${ADDR_GAP_PTS}pt gap`
        }
        bodyRef={addrRef}
        toolbar={
          <ChartExportToolbar
            onCsv={() => exportCsv(addrData, "addressable-vs-total.csv")}
            onPng={() => void exportPng(addrRef.current, "addressable-vs-total.png")}
          />
        }
      >
        {addrData.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No meaningful addressable/total gaps for this audience (threshold {ADDR_GAP_PTS}pts).
          </p>
        ) : (
          <>
            <GroupedBarChart
              data={addrData}
              xKey="channel"
              series={[
                { key: "total", label: "Total reach %", color: "var(--av-chart-2)" },
                { key: "addressable", label: "Addressable reach %", color: "var(--av-chart-1)" },
              ]}
              valueFormat="number"
              className="h-[300px] w-full"
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Gap shows the digital-buyable share versus total consumption. Toggle Stage B reach
              basis for planning weights; both bases are always available here.
            </p>
          </>
        )}
      </BaseChartCard>
        </>
      ) : null}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Reach figures are channel-consumption potential for the composed audience (weighted
        counts ÷ audience size) — not de-duplicated delivered campaign reach across channels.
      </p>
    </div>
  )
}

/** Top DFII channel label for audience cards. */
export function topDfiiLabel(scored: { ch: { name: string }; bcs: number }[]): string | null {
  if (scored.length === 0) return null
  const vals = dfii(scored.map((s) => ({ bcs: s.bcs })))
  let bestIdx = -1
  let best = -Infinity
  vals.forEach((v, i) => {
    if (v != null && v > best) {
      best = v
      bestIdx = i
    }
  })
  if (bestIdx < 0) return null
  return `${scored[bestIdx]!.ch.name} (${best})`
}

export { DfiiValue }
