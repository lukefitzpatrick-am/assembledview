"use client"

import { AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"

type Props = {
  /** `describeLegacyPartialUnresolved` text, or null to render nothing. */
  message: string | null
  className?: string
}

/**
 * MB-33 (B21, decision Q8): lines saved in an old partial MBA that match no
 * line on the plan. They stay out of the MBA. Display only.
 */
export function PartialMbaUnmatchedNotice({ message, className }: Props) {
  if (!message) return null
  return (
    <div
      role="alert"
      data-partial-mba-unmatched="1"
      className={cn(
        "rounded-card border border-status-attention-fg/20 bg-status-attention-bg px-4 py-3 text-status-attention-fg",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">Saved lines not matched</p>
          <p className="text-sm opacity-90">{message}</p>
        </div>
      </div>
    </div>
  )
}
