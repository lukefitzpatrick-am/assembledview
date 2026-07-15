"use client"

import { AlertTriangle } from "lucide-react"
import { countIncompleteExpertRows } from "@/lib/mediaplan/expertRowCompleteness"
import { cn } from "@/lib/utils"

/**
 * Summary chip shown above Apply when expert rows are incomplete (UX-12).
 */
export function ExpertIncompleteRowsSummary({
  rows,
  className,
}: {
  rows: ReadonlyArray<Parameters<typeof countIncompleteExpertRows>[0][number]>
  className?: string
}) {
  const n = countIncompleteExpertRows(rows)
  if (n === 0) return null
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-md border border-pacing-behind/40 bg-pacing-behind-bg/50 px-3 py-2 text-xs text-status-behind-fg",
        className
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="num font-semibold">
        {n} incomplete {n === 1 ? "row" : "rows"}
      </span>
      <span className="text-muted-foreground">
        — missing required fields or schedule quantity. You can still Apply, then fix on the cards.
      </span>
    </div>
  )
}
