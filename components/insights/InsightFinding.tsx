import type { ReactNode } from "react"

import { StatusPill } from "@/components/ui/status-pill"
import { cn } from "@/lib/utils"

export type InsightFindingProps = {
  body: ReactNode
  action?: string | null
  actionOwner?: string | null
  outcome?: string | null
  outcomeKind?: string | null
  compact?: boolean
  /** Extra classes on the insight body. Use for a tighter clamp on dense cards. */
  bodyClassName?: string
}

function present(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text ? text : null
}

function kindLabel(kind: string | null | undefined): "Achieved" | "Expected" | null {
  if (kind === "achieved") return "Achieved"
  if (kind === "expected") return "Expected"
  return null
}

/** Insight, and Action / Outcome when the row has them. Old rows show the Insight tag only. */
export function InsightFinding({
  body,
  action,
  actionOwner,
  outcome,
  outcomeKind,
  compact,
  bodyClassName,
}: InsightFindingProps) {
  const actionText = present(action)
  const owner = present(actionOwner)
  const outcomeText = present(outcome)
  const kind = kindLabel(outcomeKind)

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <StatusPill tone="insight" label="Insight" size="sm" />
        <div
          className={cn(
            "text-sm text-foreground",
            bodyClassName ?? (compact ? "line-clamp-3" : undefined),
          )}
        >
          {body}
        </div>
      </div>
      {actionText ? (
        <div className="space-y-1">
          <StatusPill tone="action" label="Action" size="sm" />
          <p className="text-sm text-foreground">{actionText}</p>
          {owner ? <p className="text-xs text-muted-foreground">Owner: {owner}</p> : null}
        </div>
      ) : null}
      {outcomeText ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill tone="outcome" label="Outcome" size="sm" />
            {kind ? <span className="text-[11px] text-muted-foreground">{kind}</span> : null}
          </div>
          <p className="text-sm text-foreground">{outcomeText}</p>
        </div>
      ) : null}
    </div>
  )
}
