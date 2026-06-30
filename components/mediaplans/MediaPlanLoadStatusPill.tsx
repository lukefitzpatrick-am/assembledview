"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Check, X, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { LoadingDots } from "@/components/ui/loading-dots"
import type { SaveStatusItem } from "@/components/ui/saving-modal"

interface MediaPlanLoadStatusPillProps {
  items: SaveStatusItem[]
  isLoading: boolean
  onDismiss?: () => void
  /** Optional: called when user clicks an errored section name. Receives the item name. */
  onItemClick?: (name: string) => void
}

export function MediaPlanLoadStatusPill({
  items,
  isLoading,
  onDismiss,
  onItemClick,
}: MediaPlanLoadStatusPillProps) {
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) return null

  const totalCount = items.length
  const successCount = items.filter((i) => i.status === "success").length
  const errorCount = items.filter((i) => i.status === "error").length
  const pendingCount = items.filter((i) => i.status === "pending").length

  const hasErrors = errorCount > 0
  const allDone = pendingCount === 0
  const canDismiss = !isLoading && allDone

  // Hide the pill entirely when everything succeeded and nothing is loading
  if (allDone && !hasErrors && !isLoading) return null

  const headerLabel = hasErrors
    ? `Loaded with ${errorCount} error${errorCount === 1 ? "" : "s"}`
    : isLoading
      ? `Loading sections (${successCount}/${totalCount})`
      : `All sections loaded`

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-40 flex w-[320px] max-w-[90vw] flex-col rounded-card border bg-surface-panel shadow-e2",
        hasErrors ? "border-destructive/50" : "border-border"
      )}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className="flex items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isLoading && pendingCount > 0 ? (
            <LoadingDots size="sm" dotClassName="bg-primary" aria-label="Loading" />
          ) : hasErrors ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          ) : (
            <Check className="h-4 w-4 shrink-0 text-status-ahead-fg" aria-hidden />
          )}
          <span className="truncate text-sm font-medium">{headerLabel}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canDismiss && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Dismiss"
              className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation()
                onDismiss?.()
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onDismiss?.()
                }
              }}
            >
              <X className="h-4 w-4" />
            </span>
          )}
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </div>
      </button>

      {expanded && (
        <div className="max-h-[40vh] overflow-y-auto border-t border-border px-3 py-2">
          <ul className="flex flex-col gap-1.5">
            {items.map((item, idx) => {
              const clickable = item.status === "error" && !!onItemClick
              return (
                <li
                  key={`${item.name}-${idx}`}
                  className={cn(
                    "flex items-start gap-2 rounded px-2 py-1.5 text-sm",
                    item.status === "error" && "bg-destructive/10",
                    item.status === "success" && "bg-pacing-ahead-bg",
                    clickable && "cursor-pointer hover:bg-destructive/15"
                  )}
                  onClick={() => {
                    if (clickable) onItemClick?.(item.name)
                  }}
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {item.status === "pending" && (
                      <LoadingDots size="sm" dotClassName="bg-muted-foreground" aria-label="Pending" />
                    )}
                    {item.status === "success" && (
                      <Check className="h-4 w-4 text-status-ahead-fg" />
                    )}
                    {item.status === "error" && (
                      <X className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{item.name}</div>
                    {item.status === "error" && item.error && (
                      <div className="mt-0.5 text-xs text-destructive">
                        {item.error}
                        {clickable && " — click to jump to section"}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
