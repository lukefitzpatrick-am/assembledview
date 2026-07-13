"use client"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AdapterResult } from "@/lib/planning/adapter"
import type { BriefState } from "@/components/planning/store"
import type { AudienceDraft } from "@/components/planning/store"
import type { PlanningSegment } from "@/lib/planning/types"
import type { ScoredChannel } from "@/app/tools/behavioural-planner/lib/types"
import { cn } from "@/lib/utils"
import { useAudienceInsight } from "./useAudienceInsight"

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
  const { insight, loading, error, generate, canGenerate } = useAudienceInsight({
    draft,
    adapted,
    scored,
    brief,
    waveLabel,
    segments,
    cacheKey,
    cachedInsight,
    onInsight,
  })

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
          disabled={!canGenerate || loading}
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
