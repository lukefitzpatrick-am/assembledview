"use client"

import type { AllocatedChannel } from "@/app/tools/behavioural-planner/lib/types"
import { dfii } from "@/lib/planning/dfii"
import { cn } from "@/lib/utils"
import { DfiiValue } from "./OutcomeCharts"
import { AUDIENCE_ACCENTS } from "./constants"
import type { AudienceCompareBundle } from "./StageCompare"

type RecommendedSplitBlockProps = {
  bundles: AudienceCompareBundle[]
  /** When true, show indicative dollars from allocate (brief.budget > 0). */
  showDollars: boolean
}

type SplitRow = {
  channelId: string
  channelName: string
  cells: Array<{
    audienceId: string
    pct: number
    dollars: number
    isLead: boolean
    dfii: number | null
  } | null>
  combinedWeight: number
  scoredOrder: number
}

function fmtDollars(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `$${Math.round(n / 1000)}k`
  return `$${Math.round(n)}`
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function buildSplitRows(bundles: AudienceCompareBundle[]): SplitRow[] {
  const channelMap = new Map<
    string,
    { name: string; byAudience: Map<string, AllocatedChannel | null>; scoredOrder: number }
  >()

  const dfiiByAudience = new Map<string, Map<string, number | null>>()
  for (const b of bundles) {
    const vals = dfii(b.scored.map((s) => ({ bcs: s.bcs })))
    const map = new Map<string, number | null>()
    b.scored.forEach((s, i) => map.set(s.ch.id, vals[i] ?? null))
    dfiiByAudience.set(b.draft.id, map)
  }

  const allocByAudience = new Map<string, Map<string, AllocatedChannel>>()
  for (const b of bundles) {
    allocByAudience.set(
      b.draft.id,
      new Map(b.allocated.map((a) => [a.ch.id, a]))
    )
  }

  // All scored channels (BCS desc via computeBcs), left-join allocation.
  bundles.forEach((b, bundleIdx) => {
    b.scored.forEach((s, scoreIdx) => {
      const existing = channelMap.get(s.ch.id)
      const alloc = allocByAudience.get(b.draft.id)?.get(s.ch.id) ?? null
      if (!existing) {
        channelMap.set(s.ch.id, {
          name: s.ch.name,
          byAudience: new Map([[b.draft.id, alloc]]),
          // Prefer first audience's BCS order as primary sort key.
          scoredOrder: bundleIdx === 0 ? scoreIdx : 10_000 + scoreIdx,
        })
      } else {
        existing.byAudience.set(b.draft.id, alloc)
        if (bundleIdx === 0) existing.scoredOrder = scoreIdx
      }
    })
  })

  const rows: SplitRow[] = []
  for (const [channelId, meta] of channelMap) {
    const cells = bundles.map((b) => {
      if (!meta.byAudience.has(b.draft.id) && !b.scored.some((s) => s.ch.id === channelId)) {
        return null
      }
      const alloc = meta.byAudience.get(b.draft.id) ?? null
      const inScored = b.scored.some((s) => s.ch.id === channelId)
      if (!inScored) return null
      return {
        audienceId: b.draft.id,
        pct: alloc?.pct ?? 0,
        dollars: alloc?.dollars ?? 0,
        isLead: false,
        dfii: dfiiByAudience.get(b.draft.id)?.get(channelId) ?? null,
      }
    })

    let maxW = -1
    let leadIdx = -1
    cells.forEach((c, i) => {
      // Lead only among channels that carry budget (top-N allocation).
      if (c && c.pct > maxW) {
        maxW = c.pct
        leadIdx = i
      }
    })
    if (leadIdx >= 0 && cells[leadIdx] && cells[leadIdx]!.pct > 0) {
      cells[leadIdx] = { ...cells[leadIdx]!, isLead: true }
    }

    const combinedWeight = cells.reduce((s, c) => s + (c?.pct ?? 0), 0)
    rows.push({
      channelId,
      channelName: meta.name,
      cells,
      combinedWeight,
      scoredOrder: meta.scoredOrder,
    })
  }

  return rows.sort((a, b) => {
    if (a.scoredOrder !== b.scoredOrder) return a.scoredOrder - b.scoredOrder
    return b.combinedWeight - a.combinedWeight
  })
}

export function RecommendedSplitBlock({
  bundles,
  showDollars,
}: RecommendedSplitBlockProps) {
  const rows = buildSplitRows(bundles)

  const totals = bundles.map((b) => {
    const pct = b.allocated.reduce((s, a) => s + a.pct, 0)
    const dollars = b.allocated.reduce((s, a) => s + a.dollars, 0)
    return { pct, dollars }
  })

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">Recommended split</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          All channels shown with DFII. Budget concentrates in the top{" "}
          {bundles[0]?.allocated.length || 8} by BCS (power 1.5) — percentages sum to
          100% per audience
          {showDollars
            ? ". Dollars are indicative — benchmark CPMs until warehouse CPMs are seeded."
            : ". Add a working budget in Stage A to see indicative dollars."}
        </p>
      </div>
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
              <>
                {rows.map((row) => (
                  <tr
                    key={row.channelId}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-3 py-2.5 font-medium">{row.channelName}</td>
                    {row.cells.map((cell, i) => {
                      const b = bundles[i]!
                      const accent = AUDIENCE_ACCENTS[b.draft.colorIndex]!
                      if (!cell) {
                        return (
                          <td
                            key={b.draft.id}
                            className="px-3 py-2.5 text-muted-foreground"
                          >
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
                                  width: `${Math.min(100, cell.pct)}%`,
                                  background: accent.cssVar,
                                }}
                              />
                            </div>
                            <span className="num w-10 text-right text-xs tabular-nums">
                              {fmtPct(cell.pct)}
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
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                            {showDollars ? (
                              <span
                                className="num tabular-nums"
                                title="Indicative — benchmark CPMs"
                              >
                                {fmtDollars(cell.dollars)}
                              </span>
                            ) : null}
                            <span className="inline-flex items-center gap-1">
                              DFII <DfiiValue value={cell.dfii} />
                            </span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr className="border-t border-border bg-muted/20 text-xs font-medium">
                  <td className="px-3 py-2.5">Total</td>
                  {totals.map((t, i) => {
                    const b = bundles[i]!
                    return (
                      <td key={b.draft.id} className="px-3 py-2.5">
                        <span className="num tabular-nums">{fmtPct(t.pct)}</span>
                        {showDollars ? (
                          <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                            <span className="num tabular-nums">{fmtDollars(t.dollars)}</span>
                            <span className="ml-1">indicative — benchmark CPMs</span>
                          </span>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
