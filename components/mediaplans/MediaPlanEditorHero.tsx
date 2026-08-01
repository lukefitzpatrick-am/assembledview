"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { PageHeroShell, PageHeroTitleBlock } from "@/components/dashboard/PageHeroShell"
import { cn } from "@/lib/utils"

/** Matches PageHeroShell padding tokens, with extra pe to clear BrandMarkWatermark. */
const HERO_ROW_PAD =
  "gap-x-8 gap-y-5 px-6 pb-6 pt-6 pe-28 md:gap-x-8 md:px-7 md:pb-7 md:pt-7 md:pe-32"
const HERO_ROW_PAD_COMPACT =
  "gap-x-6 gap-y-4 px-5 pb-5 pt-5 pe-28 md:px-6 md:pb-6 md:pt-6 md:pe-32"

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
      {/* Content floors 280/460: shrink-0 wraps instead of clipping under overflow-hidden; pe clears brand mark. */}
      <div
        className={cn(
          "relative z-10 flex w-full flex-wrap items-start justify-between",
          compact ? HERO_ROW_PAD_COMPACT : HERO_ROW_PAD,
        )}
      >
        <div className="min-w-0 grow basis-[min(280px,100%)] shrink-0">
          <PageHeroTitleBlock title={title} detail={detail} brandColour={brandColour} />
        </div>

        {actions ? (
          <div className="flex min-w-0 grow basis-[min(460px,100%)] shrink-0 flex-wrap items-center gap-2 justify-start md:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </PageHeroShell>
  )
}
