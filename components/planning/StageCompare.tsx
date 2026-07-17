"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import type { AllocatedChannel, ScoredChannel } from "@/app/tools/behavioural-planner/lib/types"
import type { AdapterResult } from "@/lib/planning/adapter"
import type { PlanningAudienceRow } from "@/lib/planning/audienceTypes"
import { buildCreateCampaignHref } from "@/lib/mediaplan/createPrefill"
import { PLANNING_CHANNEL_BENCH_VERSION } from "@/lib/planning/planningChannelBench"
import { buildRecommendedSplitV1 } from "@/lib/planning/recommendedSplit"
import { cn } from "@/lib/utils"
import { CompareAudienceInsight } from "./CompareAudienceInsight"
import { ExportDeckButton } from "./ExportDeckButton"
import { AllChannelsCompareTable } from "./AllChannelsCompareTable"
import { OutcomeCharts, topDfiiLabel } from "./OutcomeCharts"
import { RecommendedSplitBlock } from "./RecommendedSplitBlock"
import { SavedAudienceAttachList } from "./SavedAudienceAttachList"
import { AUDIENCE_ACCENTS } from "./constants"
import { formatAudienceWc, robustnessFromN } from "./robustness"
import type {
  AudienceDraft,
  BriefState,
  DiagnosisState,
} from "./store"
import type { PlanningSegment } from "@/lib/planning/types"

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
  /** Frozen Stage E → create handoff snapshot (lives in freeform definition_json). */
  recommended_split?: ReturnType<typeof buildRecommendedSplitV1>
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
  /** engineChannelId → display name for export constraints summary */
  channelNamesById: Record<string, string>
  /** Lookup shared insight cache entry for an audience draft id. */
  insightFor: (draftId: string) => { cacheKey: string; cachedInsight: string | null }
  onInsight: (cacheKey: string, text: string) => void
  segments: PlanningSegment[]
  onOpenMethodology: (focusId?: string) => void
  onLoadSaved: (row: PlanningAudienceRow) => void
  onAudienceSaved: () => void
  onBack: () => void
}

function blendedReach(allocated: AllocatedChannel[]): number {
  return allocated.reduce((s, a) => s + a.ch.reachPct * 100 * (a.pct / 100), 0)
}

function topMix(allocated: AllocatedChannel[], n = 3) {
  return allocated.slice(0, n)
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
  channelNamesById,
  insightFor,
  onInsight,
  segments,
  onOpenMethodology,
  onLoadSaved,
  onAudienceSaved,
  onBack,
}: StageCompareProps) {
  const { toast } = useToast()
  const router = useRouter()
  const createShare = 100 - diagnosis.createCapture
  const captureShare = diagnosis.createCapture
  const colCount = bundles.length
  const showDollars = brief.budget > 0
  const [savingId, setSavingId] = useState<string | null>(null)
  /** draft.id → saved planning audience id (for Start campaign handoff). */
  const [lastSavedByDraftId, setLastSavedByDraftId] = useState<Record<string, number>>(
    {}
  )

  const canSave = Boolean(brief.clientId && brief.clientName.trim())
  const insightByAudienceId = Object.fromEntries(
    bundles.map((b) => [b.draft.id, insightFor(b.draft.id).cachedInsight])
  )

  async function saveAudienceWithSplit(
    bundle: AudienceCompareBundle
  ): Promise<PlanningAudienceRow | null> {
    if (!brief.clientId) {
      toast({
        title: "Select a client first",
        description: "Stage A needs a client before saving an audience.",
        variant: "destructive",
      })
      return null
    }
    const recommended_split = buildRecommendedSplitV1({
      allocated: bundle.allocated.map((a) => ({
        engineChannelId: a.ch.id,
        pct: a.pct,
        dollars: a.dollars,
      })),
      budget: brief.budget,
      benchVersion: PLANNING_CHANNEL_BENCH_VERSION,
    })
    const definition: SavedAudienceDefinition = {
      audience: bundle.draft,
      brief,
      diagnosis,
      exclusions: excludedChannelIds,
      wave_id: waveId,
      recommended_split,
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
    setLastSavedByDraftId((prev) => ({ ...prev, [bundle.draft.id]: saved.id }))
    onAudienceSaved()
    return saved
  }

  async function handleUseAudience(bundle: AudienceCompareBundle) {
    setSavingId(bundle.draft.id)
    try {
      const saved = await saveAudienceWithSplit(bundle)
      if (!saved) return
      toast({
        title: `Saved “${saved.name}”`,
        description:
          "Audience stored for this client. Start campaign to prefill create, or attach below for the client dashboard.",
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

  async function handleStartCampaign(bundle: AudienceCompareBundle) {
    setSavingId(bundle.draft.id)
    try {
      // Always re-freeze current allocation so create gets a fresh snapshot.
      const saved = await saveAudienceWithSplit(bundle)
      if (!saved?.id) return
      router.push(
        buildCreateCampaignHref({
          audienceId: saved.id,
          clientId: brief.clientId,
          campaignName: brief.campaignName,
          start: brief.startDate,
          end: brief.endDate,
        })
      )
    } catch (err) {
      toast({
        title: "Could not start campaign",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Compare & plan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Per-audience mix side-by-side. Audiences are compared — never added together.
          </p>
        </div>
        <ExportDeckButton
          brief={brief}
          diagnosis={diagnosis}
          waveLabel={waveLabel}
          reachBasis={reachBasis}
          bundles={bundles}
          excludedChannelIds={excludedChannelIds}
          channelNamesById={channelNamesById}
          insightByAudienceId={insightByAudienceId}
          insightFor={insightFor}
          onInsight={onInsight}
          segments={segments}
          showDollars={showDollars}
        />
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
                <CompareAudienceInsight
                  draft={b.draft}
                  adapted={b.adapted}
                  scored={b.scored}
                  brief={brief}
                  waveLabel={waveLabel}
                  segments={segments}
                  cacheKey={insightFor(b.draft.id).cacheKey}
                  cachedInsight={insightFor(b.draft.id).cachedInsight}
                  onInsight={onInsight}
                />
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
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={
                      !canSave || busy || !b.adapted || b.allocated.length === 0
                    }
                    onClick={() => void handleStartCampaign(b)}
                  >
                    {busy && lastSavedByDraftId[b.draft.id]
                      ? "Starting…"
                      : busy
                        ? "Saving…"
                        : "Start campaign"}
                  </Button>
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
        <TabsContent value="mix" className="space-y-6">
          <AllChannelsCompareTable bundles={bundles} />
          <RecommendedSplitBlock bundles={bundles} showDollars={showDollars} />
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
