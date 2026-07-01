"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  PAGE_HERO_PADDING,
  PAGE_HERO_PADDING_COMPACT,
  PageHeroShell,
  PageHeroTitleBlock,
} from "@/components/dashboard/PageHeroShell"
import { cn } from "@/lib/utils"

export interface MediaPlanEditorHeroProps {
  title: string
  /** Primary helper text and any extra lines (e.g. MBA reference) */
  detail?: ReactNode
  /** Right-aligned controls (e.g. Copy Context) */
  actions?: ReactNode
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
  brandColour,
  className,
  compact = false,
}: MediaPlanEditorHeroProps) {
  return (
    <PageHeroShell className={className}>
      <div
        className={cn(
          "relative z-10 flex w-full flex-col md:flex-row md:items-start md:justify-between",
          compact ? `${PAGE_HERO_PADDING_COMPACT} gap-4 md:gap-6` : `${PAGE_HERO_PADDING} gap-5 md:gap-8`,
        )}
      >
        <PageHeroTitleBlock title={title} detail={detail} brandColour={brandColour} />

        {actions ? (
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 sm:justify-end md:pt-0.5">
            {actions}
          </div>
        ) : null}
      </div>
    </PageHeroShell>
  )
}
