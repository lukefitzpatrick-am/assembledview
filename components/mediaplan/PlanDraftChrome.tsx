"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { PlanSavePill } from "@/lib/mediaplan/drafts/pill"

export function PlanDraftPill(props: {
  pill: PlanSavePill | null
  tipLabel?: string | null
}) {
  if (!props.pill) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="secondary" size="sm" className="rounded-pill font-normal">
        {props.pill.primary}
      </Badge>
      {props.pill.secondary ? <span>{props.pill.secondary}</span> : null}
      {props.tipLabel ? (
        <span className="text-muted-foreground">Docs/pacing serve {props.tipLabel}</span>
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
