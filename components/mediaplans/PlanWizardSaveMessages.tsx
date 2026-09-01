"use client"

import { AlertTriangle, Loader2 } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  scrollToBuilderTarget,
  type BuilderIssue,
} from "@/lib/mediaplan/builderIssues"
import { cn } from "@/lib/utils"

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * Sidebar save-status card for create/edit. Grows to fit — never a scrollbox.
 * The sticky rail (`PlanWizardShell` aside) is not a scroll container.
 *
 * Zone order is priority, not source order: problems, then draft, then save
 * state. Empty = not rendered.
 */
export function PlanWizardSaveMessages(props: {
  issues?: BuilderIssue[]
  extraProblemTexts?: string[]
  draftBanner?: ReactNode
  savePrimary?: string | null
  saveSecondary?: string | null
  saveTip?: string | null
  isSaving?: boolean
}) {
  const issues = props.issues ?? []
  const extraProblemTexts = (props.extraProblemTexts ?? []).filter((text) =>
    hasText(text)
  )
  const draftBanner = props.draftBanner ?? null
  const savePrimary = hasText(props.savePrimary) ? props.savePrimary.trim() : null
  const saveSecondary = hasText(props.saveSecondary) ? props.saveSecondary.trim() : null
  const saveTip = hasText(props.saveTip) ? props.saveTip.trim() : null
  const isSaving = props.isSaving === true

  const problemCount = issues.length + extraProblemTexts.length
  const hasProblems = problemCount > 0
  const hasDraft = draftBanner != null
  const hasSave =
    isSaving || savePrimary != null || saveSecondary != null || saveTip != null

  if (!hasProblems && !hasDraft && !hasSave) return null

  const zones: ReactNode[] = []

  if (hasProblems) {
    const heading = problemCount === 1 ? "1 issue" : `${problemCount} issues`
    zones.push(
      <div
        key="problems"
        className="min-w-0 border-l-[3px] border-l-status-warning bg-status-warning/10 py-3 pl-[9px] pr-3"
      >
        <p className="flex items-start gap-1.5 text-xs font-semibold text-status-behind-fg">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{heading}</span>
        </p>
        <ul className="mt-2 space-y-2" role="list">
          {issues.map((issue) => (
            <li key={issue.id}>
              <button
                type="button"
                className="block w-full rounded-input px-0.5 py-0.5 text-left transition-colors hover:bg-table-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => scrollToBuilderTarget(issue.scrollTargetId)}
              >
                {(issue.fieldLabel || issue.stepLabel) ? (
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {[issue.stepLabel, issue.fieldLabel].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
                <span className="block whitespace-normal break-words text-xs font-medium text-foreground">
                  {issue.title}
                </span>
                {issue.detail ? (
                  <span className="mt-0.5 block whitespace-normal break-words text-[11px] text-muted-foreground">
                    {issue.detail}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {extraProblemTexts.map((text) => (
            <li
              key={text}
              role="alert"
              className="whitespace-normal break-words text-xs font-medium text-status-critical-fg"
            >
              {text}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (hasDraft) {
    zones.push(
      <div key="draft" className="min-w-0 p-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Unsaved draft
        </p>
        {draftBanner}
      </div>
    )
  }

  if (hasSave) {
    zones.push(
      <div key="save" className="min-w-0 space-y-1.5 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          On save
        </p>
        {isSaving ? (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
            <span>Saving…</span>
          </p>
        ) : savePrimary ? (
          <Badge
            variant="info"
            size="sm"
            className="max-w-full whitespace-normal rounded-pill font-semibold"
          >
            {savePrimary}
          </Badge>
        ) : null}
        {saveSecondary ? (
          <p className="whitespace-normal break-words text-[11px] leading-snug text-foreground/70">
            {saveSecondary}
          </p>
        ) : null}
        {saveTip ? (
          <p className="whitespace-normal break-words text-[11px] leading-snug text-foreground/70">
            Docs/pacing serve {saveTip}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-frame border border-border bg-card text-foreground shadow-e1"
      role="status"
      aria-label="Save status"
    >
      <div className="flex min-w-0 flex-col">
        {zones.map((zone, index) => (
          <div
            key={index}
            className={cn(index > 0 && "border-t border-border")}
          >
            {zone}
          </div>
        ))}
      </div>
    </div>
  )
}

export function PlanWizardSaveDraftActions(props: {
  children: ReactNode
}) {
  return <div className="mt-2 flex flex-col gap-1.5">{props.children}</div>
}

export function PlanWizardSaveDraftActionButton(props: {
  children: ReactNode
  variant?: "outline" | "ghost"
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={props.variant ?? "outline"}
      className="h-8 w-full"
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  )
}
