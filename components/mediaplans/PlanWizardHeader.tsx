"use client"

import type { ReactNode } from "react"

import { PageHeader } from "@/components/layout/PageHeader"
import { Badge } from "@/components/ui/badge"

export type PlanWizardHeaderProps = {
  title: ReactNode
  /** Serif phrase after the title. The full stop lands on this word. */
  accent?: string
  lede?: ReactNode
  /**
   * Optional second row under the title (edit version chrome + AVA skill
   * actions on both twins). Never a third row — wrap inside this slot.
   */
  secondary?: ReactNode
  /** Edit only. Context pill beside the title while the form is dirty. */
  unpublishedChanges?: boolean
}

/**
 * Shared create/edit wizard page header.
 * Both mega-pages render this so row structure cannot drift.
 * Primary row is title + lede only — no actions slot. The top bar owns the breadcrumb.
 */
export function PlanWizardHeader({
  title,
  accent,
  lede,
  secondary,
  unpublishedChanges = false,
}: PlanWizardHeaderProps) {
  const heading = unpublishedChanges ? (
    <span className="inline-flex flex-wrap items-center gap-3">
      {title}
      <Badge variant="neutral" size="sm" className="rounded-pill font-sans tracking-normal">
        Unpublished changes
      </Badge>
    </span>
  ) : (
    title
  )

  return (
    <div className="mb-2 space-y-3">
      <PageHeader title={heading} accent={accent} lede={lede} />
      {secondary ? <div className="min-w-0">{secondary}</div> : null}
    </div>
  )
}

export type PlanWizardVersionChromeProps = {
  versionLabel: ReactNode
  trail: ReactNode
  versionSelect?: ReactNode
  showDraftBadge?: boolean
}

/** Edit-only secondary-row chrome: version pill · trail · picker. */
export function PlanWizardVersionChrome({
  versionLabel,
  trail,
  versionSelect,
  showDraftBadge = false,
}: PlanWizardVersionChromeProps) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-xs text-muted-foreground"
      role="group"
      aria-label="Plan version"
    >
      <span className="num break-words">{versionLabel}</span>
      {showDraftBadge ? (
        <Badge variant="info" size="sm" className="rounded-pill">
          Draft
        </Badge>
      ) : null}
      <span className="text-border" aria-hidden>
        •
      </span>
      <span className="min-w-0 break-words">{trail}</span>
      {versionSelect}
    </div>
  )
}
