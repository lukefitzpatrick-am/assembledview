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
  title: ReactNode
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
          "relative z-10 flex w-full flex-wrap items-start justify-between",
          compact
            ? `${PAGE_HERO_PADDING_COMPACT} gap-x-6 gap-y-4`
            : `${PAGE_HERO_PADDING} gap-x-8 gap-y-5`,
        )}
      >
        <div className="min-w-0 flex-1 basis-[280px]">
          <PageHeroTitleBlock title={title} detail={detail} brandColour={brandColour} />
        </div>

        {actions ? (
          <div className="flex min-w-0 flex-1 basis-[460px] flex-wrap items-center gap-2 justify-start md:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </PageHeroShell>
  )
}
