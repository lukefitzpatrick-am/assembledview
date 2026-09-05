"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { PageHeroShell, PageHeroTitleBlock } from "@/components/dashboard/PageHeroShell"
import { cn } from "@/lib/utils"

/** Matches PageHeroShell padding tokens, with extra pe to clear BrandMarkWatermark. */
const HERO_INSET =
  "px-6 pb-6 pt-6 pe-28 md:px-7 md:pb-7 md:pt-7 md:pe-32"
const HERO_INSET_COMPACT =
  "px-5 pb-5 pt-5 pe-28 md:px-6 md:pb-6 md:pt-6 md:pe-32"

/** Content floors: wrap as a unit instead of clipping under overflow-hidden. */
const TITLE_FLOOR = "basis-[min(280px,100%)]"
const ACTIONS_FLOOR = {
  /** Single CTA (Home). */
  default: "basis-[min(460px,100%)]",
  /** Layout + search + primary CTA (Campaigns list) — keeps the toolbar one row. */
  toolbar: "basis-[min(780px,100%)]",
} as const

export interface MediaPlanEditorHeroProps {
  title: ReactNode
  /** Primary helper text and any extra lines (e.g. MBA reference) */
  detail?: ReactNode
  /** Right-aligned controls on non-wizard heroes (e.g. Creative / Trafficking pages). */
  actions?: ReactNode
  /**
   * Optional second row in the same card (wizard edit chrome).
   * Wrap here — never add a third hero row.
   */
  secondary?: ReactNode
  /**
   * Actions content floor. `toolbar` fits Layout + fixed search + Create on one
   * wrapping row so the primary CTA is not orphaned under a mid-header cluster.
   */
  actionsFloor?: keyof typeof ACTIONS_FLOOR
  /** Brand accent for the title underline; defaults to lime (`bg-accent`). */
  brandColour?: string
  className?: string
  /** Optional leading icon; retained for API compatibility (B2 layout is title-first). */
  Icon?: LucideIcon
  /** Tighter padding and gaps (e.g. dashboard overview). */
  compact?: boolean
}

export function MediaPlanEditorHero({
  title,
  detail,
  actions,
  secondary,
  actionsFloor = "default",
  brandColour,
  className,
  compact = false,
}: MediaPlanEditorHeroProps) {
  return (
    <PageHeroShell className={className}>
      {/* Content floors + shrink-0 wrap; pe clears brand mark (AVU4-1). */}
      <div
        className={cn(
          "relative z-10 flex w-full min-w-0 flex-col",
          compact ? HERO_INSET_COMPACT : HERO_INSET,
        )}
      >
        <div
          className={cn(
            "flex w-full min-w-0 flex-wrap items-start justify-between",
            compact ? "gap-x-6 gap-y-4" : "gap-x-8 gap-y-5",
          )}
        >
          <div className={cn("min-w-0 grow shrink-0", TITLE_FLOOR)}>
            <PageHeroTitleBlock title={title} detail={detail} brandColour={brandColour} />
          </div>

          {actions ? (
            <div
              className={cn(
                "flex min-w-0 grow shrink-0 flex-wrap items-center gap-2 justify-start md:justify-end",
                ACTIONS_FLOOR[actionsFloor],
              )}
            >
              {actions}
            </div>
          ) : null}
        </div>
        {secondary ? (
          <div className="mt-4 flex min-w-0 w-full flex-wrap items-center justify-between gap-x-4 gap-y-3">
            {secondary}
          </div>
        ) : null}
      </div>
    </PageHeroShell>
  )
}
