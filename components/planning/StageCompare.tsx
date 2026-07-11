"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { AllocatedChannel } from "@/app/tools/behavioural-planner/lib/types"
import type { AdapterResult } from "@/lib/planning/adapter"
import { cn } from "@/lib/utils"
import { AUDIENCE_ACCENTS } from "./constants"
import { formatAudienceWc, robustnessFromN } from "./robustness"
import type { AudienceDraft, BriefState, DiagnosisState } from "./store"

export type AudienceCompareBundle = {
  draft: AudienceDraft
  adapted: AdapterResult | null
  allocated: AllocatedChannel[]
  loading: boolean
  error: string | null
}

type StageCompareProps = {
  brief: BriefState
  diagnosis: DiagnosisState
  waveLabel: string
  reachBasis: string
  bundles: AudienceCompareBundle[]
  onBack: () => void
}

function fmtDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `$${Math.round(n / 1000)}k`
  return `$${Math.round(n)}`
}

function blendedReach(allocated: AllocatedChannel[]): number {
  return allocated.reduce((s, a) => s + a.ch.reachPct * 100 * (a.pct / 100), 0)
}

function topMix(allocated: AllocatedChannel[], n = 3) {
  return allocated.slice(0, n)
}

type CompareRow = {
  channelId: string
  channelName: string
  cells: Array<{
    audienceId: string
    weight: number
    reachWc: number
    dollars: number
    isLead: boolean
  } | null>
  combinedWeight: number
}

function buildCompareRows(bundles: AudienceCompareBundle[]): CompareRow[] {
  const channelMap = new Map<
    string,
    { name: string; weights: number[]; byAudience: Map<string, AllocatedChannel> }
  >()

  for (const b of bundles) {
    for (const a of b.allocated) {
      const existing = channelMap.get(a.ch.id)
      if (!existing) {
        channelMap.set(a.ch.id, {
          name: a.ch.name,
          weights: [],
          byAudience: new Map([[b.draft.id, a]]),
        })
      } else {
        existing.byAudience.set(b.draft.id, a)
      }
    }
  }

  const rows: CompareRow[] = []
  for (const [channelId, meta] of channelMap) {
    const cells = bundles.map((b) => {
      const alloc = meta.byAudience.get(b.draft.id)
      if (!alloc) return null
      return {
        audienceId: b.draft.id,
        weight: alloc.pct,
        reachWc: alloc.ch.reachWc ?? 0,
        dollars: alloc.dollars,
        isLead: false,
      }
    })

    // Lead = highest weight among defined cells for this channel
    let maxW = -1
    let leadIdx = -1
    cells.forEach((c, i) => {
      if (c && c.weight > maxW) {
        maxW = c.weight
        leadIdx = i
      }
    })
    if (leadIdx >= 0 && cells[leadIdx]) {
      cells[leadIdx] = { ...cells[leadIdx]!, isLead: true }
    }

    const combinedWeight = cells.reduce((s, c) => s + (c?.weight ?? 0), 0)
    rows.push({
      channelId,
      channelName: meta.name,
      cells,
      combinedWeight,
    })
  }

  return rows.sort((a, b) => b.combinedWeight - a.combinedWeight)
}

export function StageCompare({
  brief,
  diagnosis,
  waveLabel,
  reachBasis,
  bundles,
  onBack,
}: StageCompareProps) {
  const rows = buildCompareRows(bundles)
  const createShare = 100 - diagnosis.createCapture
  const captureShare = diagnosis.createCapture
  const colCount = bundles.length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium">Compare & plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-audience mix side-by-side. Audiences are compared — never added together.
        </p>
      </div>

      {/* Per-audience cards */}
      <div className={cn("grid gap-3", colCount === 1 ? "sm:grid-cols-1" : colCount === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        {bundles.map((b) => {
          const accent = AUDIENCE_ACCENTS[b.draft.colorIndex]!
          const rob = robustnessFromN(b.adapted?.unweightedN ?? 0)
          const lead = b.allocated[0]
          const mix = topMix(b.allocated, 3)
          const reach = blendedReach(b.allocated)
          return (
            <div
              key={b.draft.id}
              className="overflow-hidden rounded-card border border-border bg-card shadow-e1"
            >
              <div
                className={cn("px-4 py-2.5 text-sm font-medium text-primary-foreground", accent.bg)}
              >
                {b.draft.name}
              </div>
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Size{" "}
                    <span className="num text-foreground">
                      {b.adapted ? formatAudienceWc(b.adapted.audienceWc) : "—"}
                    </span>
                    &apos;000s
                  </span>
                  <span>
                    n <span className="num text-foreground">{rob.n || "—"}</span>
                  </span>
                  <span>
                    Reach{" "}
                    <span className="num text-foreground">{Math.round(reach)}%</span>
                  </span>
                </div>
                {/* Verify hooks */}
                <div className="sr-only">
                  audience_wc={b.adapted?.audienceWc ?? 0} unweighted_n={rob.n}
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">Lead: </span>
                  {lead ? lead.ch.name : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Top-3:{" "}
                  {mix.length
                    ? mix.map((m) => `${m.ch.name} ${Math.round(m.pct)}%`).join(" · ")
                    : "—"}
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        <Button type="button" size="sm" variant="outline" disabled>
                          Use audience →
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Save &amp; handoff arrives in the next build
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          )
        })}
      </div>

      {/* Channel-mix comparison table */}
      <div className="overflow-x-auto rounded-card border border-border bg-card shadow-e1">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5">Channel</th>
              {bundles.map((b) => {
                const accent = AUDIENCE_ACCENTS[b.draft.colorIndex]!
                return (
                  <th key={b.draft.id} className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                      <span className={cn("h-2 w-2 rounded-full", accent.bg)} />
                      {b.draft.name}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={1 + bundles.length}
                  className="px-3 py-6 text-center text-xs text-muted-foreground"
                >
                  No scored channels yet — complete audiences and wait for profiles.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.channelId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5 font-medium">{row.channelName}</td>
                  {row.cells.map((cell, i) => {
                    const b = bundles[i]!
                    const accent = AUDIENCE_ACCENTS[b.draft.colorIndex]!
                    if (!cell) {
                      return (
                        <td key={b.draft.id} className="px-3 py-2.5 text-muted-foreground">
                          —
                        </td>
                      )
                    }
                    return (
                      <td key={b.draft.id} className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 min-w-[48px] flex-1 overflow-hidden rounded-pill bg-[var(--fill-track)]">
                            <div
                              className="h-full rounded-pill"
                              style={{
                                width: `${Math.min(100, cell.weight)}%`,
                                background: accent.cssVar,
                              }}
                            />
                          </div>
                          <span className="num w-8 text-right text-xs tabular-nums">
                            {Math.round(cell.weight)}%
                          </span>
                          {cell.isLead ? (
                            <span
                              className={cn("h-2 w-2 shrink-0 rounded-full", accent.bg)}
                              title="Lead"
                              aria-label="Lead channel for this audience"
                            />
                          ) : (
                            <span className="h-2 w-2 shrink-0" aria-hidden />
                          )}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          <span className="num tabular-nums">
                            {formatAudienceWc(cell.reachWc)}
                          </span>
                          &apos;000s ·{" "}
                          <span className="num tabular-nums">{fmtDollars(cell.dollars)}</span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sources chips */}
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" size="sm" className="font-normal">
          Roy Morgan Single Source · wave {waveLabel}
        </Badge>
        <Badge variant="outline" size="sm" className="font-normal">
          Benchmarks: Assembled (editable)
        </Badge>
        <Badge variant="outline" size="sm" className="font-normal">
          Create:Capture {createShare}:{captureShare}
        </Badge>
        <Badge variant="outline" size="sm" className="font-normal">
          Reach basis: {reachBasis}
        </Badge>
        {brief.clientName ? (
          <Badge variant="outline" size="sm" className="font-normal">
            {brief.brandOverride || brief.clientName}
          </Badge>
        ) : null}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Reach figures are channel-consumption potential for the composed audience (weighted
        counts ÷ audience size) — not de-duplicated delivered campaign reach across channels.
      </p>

      <div className="flex justify-start">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  )
}
