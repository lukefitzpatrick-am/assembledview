"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { AdapterResult } from "@/lib/planning/adapter"
import type { BriefState } from "@/components/planning/store"
import type { AudienceDraft } from "@/components/planning/store"
import { summariseInsight } from "@/lib/planning/insightText"
import type { PlanningSegment } from "@/lib/planning/types"
import type { ScoredChannel } from "@/app/tools/behavioural-planner/lib/types"
import { cn } from "@/lib/utils"
import { useAudienceInsight } from "./useAudienceInsight"

type CompareAudienceInsightProps = {
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

export function CompareAudienceInsight({
  draft,
  adapted,
  scored,
  brief,
  waveLabel,
  segments,
  cacheKey,
  cachedInsight,
  onInsight,
}: CompareAudienceInsightProps) {
  const [open, setOpen] = useState(false)
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

  const headline = insight ? summariseInsight(insight).headline : null

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Insight
        </h4>
        {insight ? (
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
            ) : (
              "Regenerate"
            )}
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-input border border-border bg-pacing-critical-bg px-3 py-2 text-xs text-status-critical-fg">
          {error}
        </div>
      ) : null}

      {insight ? (
        <div className="space-y-1.5">
          <p className="text-sm leading-snug text-foreground">
            {headline ?? insight.split(/\r?\n/).find((l) => l.trim()) ?? "—"}
          </p>
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {open ? "Hide full" : "View full"}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div
                className={cn(
                  "mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground",
                  "rounded-input border border-border bg-card px-3 py-3"
                )}
              >
                {insight}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      ) : (
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
          ) : (
            "Generate insight"
          )}
        </Button>
      )}
    </div>
  )
}
