"use client"

import { useState } from "react"
import { X } from "lucide-react"

import { AvaSkillAction } from "@/components/ava/AvaSkillAction"
import { useAuthContext } from "@/contexts/AuthContext"
import {
  buildAvaPacingNudgeMessage,
  resolveAvaPacingNudge,
} from "@/lib/ava/resolveAvaPacingNudge"
import { cn } from "@/lib/utils"

type AvaPacingNudgeProps = {
  /** Same pacePct as hero KPIs: (actualSpend / expectedSpend) × 100 */
  pacePct: number
  className?: string
}

/**
 * Admin-only dismissible pacing nudge (in-memory only).
 * No model / server call to render — thresholds are client-side.
 */
export function AvaPacingNudge({ pacePct, className }: AvaPacingNudgeProps) {
  const { isAdmin, isLoading } = useAuthContext()
  const [dismissed, setDismissed] = useState(false)

  if (isLoading || !isAdmin || dismissed) return null

  const nudge = resolveAvaPacingNudge(pacePct)
  if (!nudge) return null

  const tone =
    nudge.kind === "over"
      ? "border-pacing-critical/40 bg-pacing-critical-bg text-status-critical-fg"
      : "border-pacing-behind/40 bg-pacing-behind-bg text-status-behind-fg"

  const accentBar =
    nudge.kind === "over" ? "bg-pacing-critical" : "bg-pacing-behind"

  return (
    <div
      role="status"
      className={cn(
        "relative flex flex-wrap items-center gap-3 overflow-hidden rounded-card border px-3 py-2 text-sm shadow-e0",
        tone,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-[3px]", accentBar)}
      />
      <p className="min-w-0 flex-1 pl-1.5 leading-snug">{nudge.copy}</p>
      <div className="flex shrink-0 items-center gap-1.5">
        <AvaSkillAction
          label="Ask AVA why"
          message={buildAvaPacingNudgeMessage(pacePct)}
          variant="outline"
          size="sm"
          className="border-border/60 bg-background/60"
        />
        <button
          type="button"
          aria-label="Dismiss pacing nudge"
          className="inline-flex h-7 w-7 items-center justify-center rounded-input text-current opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setDismissed(true)}
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}
