"use client"

import type { ReactNode } from "react"
import Link from "next/link"

import { MediaPlanEditorHero } from "@/components/mediaplans/MediaPlanEditorHero"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export type PlanWizardHeaderProps = {
  title: ReactNode
  subtitle?: ReactNode
  /** Current page crumb (e.g. "Edit Campaign"). */
  breadcrumbCurrent?: string
  /** Right slot on the primary row — create reserves it empty; edit fills Creative / Trafficking. */
  actions?: ReactNode
  /**
   * Optional second row inside the same hero card (edit-only chrome).
   * Never a third hero row — wrap inside this slot instead.
   */
  secondary?: ReactNode
}

/**
 * Shared create/edit wizard page header (breadcrumb + hero).
 * Both mega-pages render this so row structure cannot drift.
 */
export function PlanWizardHeader({
  title,
  subtitle,
  breadcrumbCurrent,
  actions,
  secondary,
}: PlanWizardHeaderProps) {
  const crumb =
    breadcrumbCurrent ?? (typeof title === "string" ? title : "Campaign")

  return (
    <>
      <Breadcrumb className="pt-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/mediaplans">Campaigns</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{crumb}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <MediaPlanEditorHero
        className="mb-2"
        title={title}
        detail={subtitle}
        actions={actions}
        secondary={secondary}
      />
    </>
  )
}

export type PlanWizardVersionChromeProps = {
  versionLabel: ReactNode
  trail: ReactNode
  versionSelect?: ReactNode
  status?: ReactNode
}

/** Edit-only secondary-row chrome: version trail (+ picker) and optional status. */
export function PlanWizardVersionChrome({
  versionLabel,
  trail,
  versionSelect,
  status,
}: PlanWizardVersionChromeProps) {
  return (
    <>
      <div
        className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-xs text-muted-foreground"
        role="group"
        aria-label="Plan version"
      >
        <span className="num break-words">{versionLabel}</span>
        <span className="text-border" aria-hidden>
          •
        </span>
        <span className="min-w-0 break-words">{trail}</span>
        {versionSelect}
      </div>
      {status ? (
        <div className="min-w-0 w-full max-w-full sm:w-auto sm:max-w-xs">{status}</div>
      ) : null}
    </>
  )
}
