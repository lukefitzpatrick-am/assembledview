"use client"

import { useState } from "react"

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

export type GenerateAudienceInsightArgs = {
  draft: AudienceDraft
  adapted: AdapterResult
  scored?: ScoredChannel[]
  brief: BriefState
  waveLabel: string
  segments: PlanningSegment[]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function segmentLabelFor(
  draft: AudienceDraft,
  segments: PlanningSegment[]
): string {
  return isBaseSegmentLens(draft.segmentId)
    ? "All People"
    : segments.find((s) => s.segment_id === draft.segmentId)?.name ??
        draft.segmentId
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

/** Shared POST /api/planning/insight call used by Stage B and Stage E. */
export async function generateAudienceInsight(
  args: GenerateAudienceInsightArgs
): Promise<string> {
  const { draft, adapted, scored, brief, waveLabel, segments } = args
  const segmentId = effectiveSegmentId(draft.segmentId)
  const rob = robustnessFromN(adapted.unweightedN)
  const pct = pctOfUniverse(adapted.audienceWc, adapted.universeWc)
  const segmentLabel = segmentLabelFor(draft, segments)

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
  return data.insight.trim()
}

type UseAudienceInsightArgs = {
  draft: AudienceDraft
  adapted: AdapterResult | null
  scored?: ScoredChannel[]
  brief: BriefState
  waveLabel: string
  segments: PlanningSegment[]
  cacheKey: string
  cachedInsight: string | null
  onInsight: (cacheKey: string, text: string) => void
}

export function useAudienceInsight({
  draft,
  adapted,
  scored,
  brief,
  waveLabel,
  segments,
  cacheKey,
  cachedInsight,
  onInsight,
}: UseAudienceInsightArgs) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (!adapted || loading) return
    setLoading(true)
    setError(null)
    try {
      const text = await generateAudienceInsight({
        draft,
        adapted,
        scored,
        brief,
        waveLabel,
        segments,
      })
      onInsight(cacheKey, text)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate insight")
    } finally {
      setLoading(false)
    }
  }

  return {
    insight: cachedInsight,
    loading,
    error,
    generate,
    canGenerate: adapted != null,
  }
}
