"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import type { AllocatedChannel, ScoredChannel } from "@/app/tools/behavioural-planner/lib/types"
import type { AdapterResult } from "@/lib/planning/adapter"
import type { PlanningAudienceRow } from "@/lib/planning/audienceTypes"
import { dfii } from "@/lib/planning/dfii"
import { cn } from "@/lib/utils"
import { DfiiValue, OutcomeCharts, topDfiiLabel } from "./OutcomeCharts"
import { SavedAudienceAttachList } from "./SavedAudienceAttachList"
import { AUDIENCE_ACCENTS } from "./constants"
import { formatAudienceWc, robustnessFromN } from "./robustness"
import type {
  AudienceDraft,
  BriefState,
  DiagnosisState,
} from "./store"

export type AudienceCompareBundle = {
  draft: AudienceDraft
  adapted: AdapterResult | null
  /** Full BCS-scored set (Stage D exclusions already applied). */
  scored: ScoredChannel[]
  allocated: AllocatedChannel[]
  loading: boolean
  error: string | null
}

export type SavedAudienceDefinition = {
  audience: AudienceDraft
  brief: BriefState
  diagnosis: DiagnosisState
  exclusions: string[]
  wave_id: string
}

type StageCompareProps = {
  brief: BriefState
  diagnosis: DiagnosisState
  waveId: string
  waveLabel: string
  reachBasis: string
  excludedChannelIds: string[]
  bundles: AudienceCompareBundle[]
  savedAudiences: PlanningAudienceRow[]
  savedLoading: boolean
  onOpenMethodology: (focusId?: string) => void
  onLoadSaved: (row: PlanningAudienceRow) => void
  onAudienceSaved: () => void
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
    dfii: number | null
  } | null>
  combinedWeight: number
}

function buildCompareRows(bundles: AudienceCompareBundle[]): CompareRow[] {
  const channelMap = new Map<
    string,
    { name: string; weights: number[]; byAudience: Map<string, AllocatedChannel> }
  >()

  const dfiiByAudience = new Map<string, Map<string, number | null>>()
  for (const b of bundles) {
    const vals = dfii(b.scored.map((s) => ({ bcs: s.bcs })))
    const map = new Map<string, number | null>()
    b.scored.forEach((s, i) => map.set(s.ch.id, vals[i] ?? null))
    dfiiByAudience.set(b.draft.id, map)
  }

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
        dfii: dfiiByAudience.get(b.draft.id)?.get(channelId) ?? null,
      }
    })

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
  waveId,
  waveLabel,
  reachBasis,
  excludedChannelIds,
  bundles,
  savedAudiences,
  savedLoading,
  onOpenMethodology,
  onLoadSaved,
  onAudienceSaved,
  onBack,
}: StageCompareProps) {
  const { toast } = useToast()
  const rows = buildCompareRows(bundles)
  const createShare = 100 - diagnosis.createCapture
  const captureShare = diagnosis.createCapture
  const colCount = bundles.length
  const [savingId, setSavingId] = useState<string | null>(null)
  const [lastSavedName, setLastSavedName] = useState<string | null>(null)

  const canSave = Boolean(brief.clientId && brief.clientName.trim())

  async function handleUseAudience(bundle: AudienceCompareBundle) {
    if (!brief.clientId) {
      toast({
        title: "Select a client first",
        description: "Stage A needs a client before saving an audience.",
        variant: "destructive",
      })
      return
    }
    setSavingId(bundle.draft.id)
    try {
      const definition: SavedAudienceDefinition = {
        audience: bundle.draft,
        brief,
        diagnosis,
        exclusions: excludedChannelIds,
        wave_id: waveId,
      }
      const res = await fetch("/api/planning/audiences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clients_id: brief.clientId,
          name: bundle.draft.name,
          definition_json: definition,
          composed_wc: bundle.adapted?.audienceWc ?? 0,
          client_visible: false,
        }),
      })
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(errBody?.error ?? `Save failed (${res.status})`)
      }
      const saved = (await res.json()) as PlanningAudienceRow
      setLastSavedName(saved.name)
      onAudienceSaved()
      toast({
        title: `Saved “${saved.name}”`,
        description:
          "Audience stored for this client. Attach it to a campaign below to show on the client dashboard.",
      })
    } catch (err) {
      toast({
        title: "Could not save audience",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-medium">Compare & plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-audience mix side-by-side. Audiences are compared — never added together.
        </p>
      </div>

      <div
        className={cn(
          "grid gap-3",
          colCount === 1
            ? "sm:grid-cols-1"
            : colCount === 2
              ? "sm:grid-cols-2"
              : "sm:grid-cols-3"
        )}
      >
        {bundles.map((b) => {
          const accent = AUDIENCE_ACCENTS[b.draft.colorIndex]!
          const rob = robustnessFromN(b.adapted?.unweightedN ?? 0)
          const lead = b.allocated[0]
          const mix = topMix(b.allocated, 3)
          const reach = blendedReach(b.allocated)
          const busy = savingId === b.draft.id
          return (
            <div
              key={b.draft.id}
              className="overflow-hidden rounded-card border border-border bg-card shadow-e1"
            >
              <div
                className={cn(
                  "px-4 py-2.5 text-sm font-medium text-primary-foreground",
                  accent.bg
                )}
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
                <div className="text-xs">
                  <span className="text-muted-foreground">Top DFII: </span>
                  {topDfiiLabel(b.scored) ?? "—"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canSave || busy || !b.adapted}
                    onClick={() => void handleUseAudience(b)}
                  >
                    {busy ? "Saving…" : "Use audience →"}
                  </Button>
                  {lastSavedName === b.draft.name ? (
                    <Button type="button" size="sm" variant="ghost" disabled>
                      Saved — attach to a campaign below
                    </Button>
                  ) : null}
                </div>
                {!canSave ? (
                  <p className="text-[10px] text-muted-foreground">
                    Select a client in Stage A to enable save.
                  </p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <Tabs defaultValue="mix" className="w-full">
        <TabsList>
          <TabsTrigger value="mix">Mix table</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
        </TabsList>
        <TabsContent value="mix" className="space-y-4">
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
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span>
                            <span className="num tabular-nums">
                              {formatAudienceWc(cell.reachWc)}
                            </span>
                            &apos;000s ·{" "}
                            <span className="num tabular-nums">{fmtDollars(cell.dollars)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            DFII <DfiiValue value={cell.dfii} />
                          </span>
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
        </TabsContent>
        <TabsContent value="charts">
          <OutcomeCharts bundles={bundles} onOpenMethodology={onOpenMethodology} />
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-1.5">
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
        <button
          type="button"
          onClick={() => onOpenMethodology()}
          className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          How we calculate →
        </button>
      </div>

      <SavedAudienceAttachList
        clientId={brief.clientId}
        clientName={brief.clientName}
        savedAudiences={savedAudiences}
        savedLoading={savedLoading}
        onLoadSaved={onLoadSaved}
        onAudiencePatched={onAudienceSaved}
      />

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
