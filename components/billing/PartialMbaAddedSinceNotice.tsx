"use client"

import { Info } from "lucide-react"

import { cn } from "@/lib/utils"

type Props = {
  /** `describeLegacyPartialAddedSince` text, or null to render nothing. */
  message: string | null
  className?: string
}

/**
 * B21fix (decision B21 R4): lines added to a channel that was all in when an
 * old partial MBA was set. They stay out of the MBA until the planner ticks
 * them in. Display only.
 */
export function PartialMbaAddedSinceNotice({ message, className }: Props) {
  if (!message) return null
  return (
    <div
      role="status"
      data-partial-mba-added-since="1"
      className={cn(
        "rounded-card border border-status-attention-fg/20 bg-status-attention-bg px-4 py-3 text-status-attention-fg",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">Lines added since the partial MBA was set</p>
          <p className="break-words text-sm opacity-90">{message}</p>
        </div>
      </div>
    </div>
  )
}
