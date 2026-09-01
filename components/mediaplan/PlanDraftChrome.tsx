"use client"

import { useRef } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { DraftDiffSummary } from "@/lib/mediaplan/drafts/fieldDiff"
import {
  formatDraftRelativeTime,
  removedLineCaption,
} from "@/lib/mediaplan/drafts/fieldDiff"
import type { PlanSavePill } from "@/lib/mediaplan/drafts/pill"
import { cn } from "@/lib/utils"

export function PlanDraftPill(props: {
  pill: PlanSavePill | null
  tipLabel?: string | null
  /** Rail: one truncated line each, no wrap into the save bar. */
  compact?: boolean
}) {
  if (!props.pill) return null
  return (
    <div
      className={cn(
        "min-w-0 text-xs text-muted-foreground",
        props.compact
          ? "flex flex-col items-start gap-0.5"
          : "flex flex-wrap items-center gap-2"
      )}
    >
      <Badge
        variant="secondary"
        size="sm"
        className={cn("rounded-pill font-normal", props.compact && "max-w-full truncate")}
      >
        {props.pill.primary}
      </Badge>
      {props.pill.secondary ? (
        <span className={cn(props.compact && "max-w-full truncate")}>
          {props.pill.secondary}
        </span>
      ) : null}
      {props.tipLabel ? (
        <span className={cn("text-muted-foreground", props.compact && "max-w-full truncate")}>
          Docs/pacing serve {props.tipLabel}
        </span>
      ) : null}
    </div>
  )
}

export function PlanDraftRecoveryBanner(props: {
  summary: string
  reason: string
  otherEditor?: string | null
  onResume: () => void
  onCompare: () => void
  onDiscard: () => void
}) {
  return (
    <div
      role="status"
      className="mb-3 rounded-card border border-border bg-surface-panel p-3 shadow-e1"
    >
      <p className="text-sm text-foreground">{props.summary}</p>
      <p className="mt-1 text-xs text-muted-foreground">{props.reason}</p>
      {props.otherEditor ? (
        <p className="mt-1 text-xs text-muted-foreground">{props.otherEditor}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={props.onResume}>
          Resume
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={props.onCompare}>
          Compare
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={props.onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  )
}

export function PlanDraftActiveBanner(props: {
  updatedAt: string
  summary: DraftDiffSummary
  onDiscard: () => void
  /** Create-page meaningful draft: names client, campaign, lines, budget. */
  headline?: string
  /** Rail: single-line text + actions stacked, no save-bar band. */
  compact?: boolean
}) {
  const cycleRef = useRef(0)
  const n = props.summary.changeCount
  const changeLabel = n === 1 ? "1 change" : `${n} changes`

  function viewChanges() {
    const nodes = document.querySelectorAll<HTMLElement>(
      "[data-draft-changed='true'], [data-draft-new-line='true']",
    )
    if (!nodes.length) return
    const i = cycleRef.current % nodes.length
    nodes[i].scrollIntoView({ behavior: "smooth", block: "center" })
    cycleRef.current = i + 1
  }

  return (
    <div
      role="status"
      className={cn(
        props.compact
          ? "flex flex-col items-stretch gap-1.5"
          : "mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-status-warning/40 bg-surface-panel px-3 py-2 shadow-e0"
      )}
    >
      <p
        className={cn(
          "text-foreground",
          props.compact
            ? "whitespace-normal break-words text-xs leading-snug"
            : "text-sm"
        )}
        title={props.headline || undefined}
      >
        {props.headline ? (
          props.headline
        ) : (
          <>
            Unsaved draft from {formatDraftRelativeTime(props.updatedAt)} loaded —{" "}
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="underline-offset-2 hover:underline">
                  {changeLabel}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 text-sm">
                <p className="font-medium text-foreground">{changeLabel}</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {props.summary.removedLines.map((line) => (
                    <li key={line.lineItemId}>{removedLineCaption(line)}</li>
                  ))}
                  {props.summary.addedLineIds.map((id) => (
                    <li key={id}>Added: {id}</li>
                  ))}
                  {props.summary.fieldChanges.length > 0 ? (
                    <li>
                      {props.summary.fieldChanges.length} field
                      {props.summary.fieldChanges.length === 1 ? "" : "s"} edited
                    </li>
                  ) : null}
                  {n === 0 ? <li>No remaining differences</li> : null}
                </ul>
              </PopoverContent>
            </Popover>
          </>
        )}
      </p>
      <div className={cn("flex gap-2", props.compact ? "flex-col" : "flex-wrap")}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={props.compact ? "h-8 w-full" : undefined}
          onClick={viewChanges}
        >
          View changes
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={props.compact ? "h-8 w-full" : undefined}
          onClick={props.onDiscard}
        >
          Discard draft
        </Button>
      </div>
    </div>
  )
}

export function PlanDraftStaleBanner(props: {
  updatedAt: string
  baseVersionNumber: number | string
  tipVersionNumber: number | string
  onLoadAnyway: () => void
  onDiscard: () => void
  onCompare?: () => void
  compact?: boolean
}) {
  return (
    <div
      role="status"
      className={cn(
        props.compact
          ? "flex flex-col items-stretch gap-1.5"
          : "mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-status-warning/40 bg-surface-panel px-3 py-2 shadow-e0"
      )}
    >
      <p
        className={cn(
          "text-foreground",
          props.compact ? "text-xs leading-snug" : "text-sm"
        )}
      >
        Draft from {formatDraftRelativeTime(props.updatedAt)} is based on v
        {props.baseVersionNumber}; the plan is now on v{props.tipVersionNumber}.
      </p>
      <div className={cn("flex gap-2", props.compact ? "flex-col" : "flex-wrap")}>
        <Button
          type="button"
          size="sm"
          className={props.compact ? "h-8 w-full" : undefined}
          onClick={props.onLoadAnyway}
        >
          Load anyway
        </Button>
        {props.onCompare ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={props.compact ? "h-8 w-full" : undefined}
            onClick={props.onCompare}
          >
            Compare
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={props.compact ? "h-8 w-full" : undefined}
          onClick={props.onDiscard}
        >
          Discard
        </Button>
      </div>
    </div>
  )
}

export function PlanStaleBaseDialog(props: {
  compare: {
    sections: { base: string; yours: string; current: string }
  }
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="max-w-lg rounded-card border border-border bg-card p-4 shadow-e2">
        <h2 className="text-base font-semibold text-foreground">Tip moved — re-apply manually</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No merge engine. Compare base / yours / current, then re-apply your edits.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <span className="font-medium">Base:</span> {props.compare.sections.base}
          </li>
          <li>
            <span className="font-medium">Yours:</span> {props.compare.sections.yours}
          </li>
          <li>
            <span className="font-medium">Current:</span> {props.compare.sections.current}
          </li>
        </ul>
        <Button type="button" className="mt-4" onClick={props.onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}

/** Line-level draft vs published tip — no merge. */
export function PlanDraftTipCompareDialog(props: {
  added: string[]
  removed: string[]
  keptCount: number
  budgetDeltaCents: number
  onClose: () => void
}) {
  const delta = props.budgetDeltaCents / 100
  const deltaLabel =
    delta >= 0 ? `+$${Math.round(delta)}` : `-$${Math.round(Math.abs(delta))}`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-card border border-border bg-card p-4 shadow-e2">
        <h2 className="text-base font-semibold text-foreground">Draft vs published tip</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {props.added.length + props.removed.length} lines changed · budget {deltaLabel} ·{" "}
          {props.keptCount} unchanged
        </p>
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <p className="font-medium text-foreground">Added ({props.added.length})</p>
            <p className="font-mono text-xs text-muted-foreground">
              {props.added.length ? props.added.join(", ") : "—"}
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Removed ({props.removed.length})</p>
            <p className="font-mono text-xs text-muted-foreground">
              {props.removed.length ? props.removed.join(", ") : "—"}
            </p>
          </div>
        </div>
        <Button type="button" className="mt-4" onClick={props.onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}
