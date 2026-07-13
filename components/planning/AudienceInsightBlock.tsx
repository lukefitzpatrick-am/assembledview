"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AdapterResult } from "@/lib/planning/adapter"
import type { BriefState } from "@/components/planning/store"
import {
  effectiveSegmentId,
  isBaseSegmentLens,
  type AudienceDraft,
} from "@/components/planning/store"
import {
  pctOfUniverse,
  robustnessFromN,
} from "@/components/planning/robustness"
import type { PlanningSegment } from "@/lib/planning/types"
import type { ScoredChannel } from "@/app/tools/behavioural-planner/lib/types"
import { cn } from "@/lib/utils"

type AudienceInsightBlockProps = {
  draft: AudienceDraft
  adapted: AdapterResult | null
  scored?: ScoredChannel[]
  brief: BriefState
  waveLabel: string
  segments: PlanningSegment[]
  /** Cache key from planner-client (audienceKey). */
  cacheKey: string
  cachedInsight: string | null
  onInsight: (cacheKey: string, text: string) => void
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function buildChannels(
  adapted: AdapterResult,
  segmentId: string,
  scored?: ScoredChannel[]
) {
  return adapted.taxonomy.slice(0, 80).map((row) => {
    let index: number | null = null
    if (row.rowType !== "rollup") {
      const engineId = row.engineChannelId ?? row.engine?.id
      if (engineId && scored) {
        const hit = scored.find((s) => s.ch.id === engineId)
        if (hit) index = Math.round(hit.affAvg)
      }
      if (index == null && row.engine) {
        const aff = row.engine.aff[segmentId]
        if (typeof aff === "number" && Number.isFinite(aff)) {
          index = Math.round(aff)
        }
      }
    }
    return {
      label: row.label,
      level1: row.level1,
      rowType: row.rowType,
      reachPct: round1(row.reachPct * 100),
      index,
      isRmMeasured: row.isRmMeasured,
    }
  })
}

export function AudienceInsightBlock({
  draft,
  adapted,
  scored,
  brief,
  waveLabel,
  segments,
  cacheKey,
  cachedInsight,
  onInsight,
}: AudienceInsightBlockProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const insight = cachedInsight

  const segmentLabel = isBaseSegmentLens(draft.segmentId)
    ? "All People"
    : segments.find((s) => s.segment_id === draft.segmentId)?.name ?? draft.segmentId

  async function generate() {
    if (!adapted || loading) return
    setLoading(true)
    setError(null)
    try {
      const segmentId = effectiveSegmentId(draft.segmentId)
      const rob = robustnessFromN(adapted.unweightedN)
      const pct = pctOfUniverse(adapted.audienceWc, adapted.universeWc)
      const res = await fetch("/api/planning/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: {
            clientName: brief.clientName || undefined,
            category: brief.category || undefined,
            objectiveKind: brief.objectiveKind ?? undefined,
            budget: brief.budget || undefined,
            startDate: brief.startDate ?? undefined,
            endDate: brief.endDate ?? undefined,
          },
          audience: {
            name: draft.name,
            segmentLabel,
            states: draft.states,
            gender: draft.gender,
            ageBands: draft.ageBands,
            reachBasis: draft.reachBasis,
          },
          stats: {
            audienceWc: adapted.audienceWc,
            universeWc: adapted.universeWc,
            pctOfUniverse: pct == null ? null : round1(pct),
            unweightedN: adapted.unweightedN,
            robustnessLabel: rob.label,
            suppressedCells: adapted.suppressedCells,
            waveLabel,
          },
          channels: buildChannels(adapted, segmentId, scored),
        }),
      })
      const data = (await res.json().catch(() => null)) as {
        insight?: string
        error?: string
        message?: string
      } | null
      if (!res.ok) {
        throw new Error(data?.message || data?.error || `Insight failed (${res.status})`)
      }
      if (!data?.insight?.trim()) {
        throw new Error("Empty insight returned")
      }
      onInsight(cacheKey, data.insight.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate insight")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Audience insight
        </h4>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={adapted == null || loading}
          onClick={() => void generate()}
        >
          {loading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Generating…
            </>
          ) : insight ? (
            "Regenerate"
          ) : (
            "Generate insight"
          )}
        </Button>
      </div>

      {adapted == null ? (
        <p className="text-xs text-muted-foreground">
          Compose the audience first — insight needs live reach and indexes.
        </p>
      ) : null}

      {error ? (
        <div className="rounded-input border border-border bg-pacing-critical-bg px-3 py-2 text-xs text-status-critical-fg">
          {error}
        </div>
      ) : null}

      {insight ? (
        <div
          className={cn(
            "whitespace-pre-wrap text-sm leading-relaxed text-foreground",
            "rounded-input border border-border bg-card px-3 py-3"
          )}
        >
          {insight}
        </div>
      ) : !loading && adapted != null ? (
        <p className="text-xs text-muted-foreground">
          Generate a composition-backed insight from this audience&apos;s channel reach and
          affinity indexes.
        </p>
      ) : null}
    </div>
  )
}
