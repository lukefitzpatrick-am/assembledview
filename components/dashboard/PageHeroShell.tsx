"use client"

import type { CSSProperties, ReactNode } from "react"

import { BrandMarkWatermark } from "@/components/ui/brand-mark-watermark"
import { cn } from "@/lib/utils"

export const PAGE_HERO_PADDING = "p-6 md:p-7"
export const PAGE_HERO_PADDING_COMPACT = "p-5 md:p-6"

export interface PageHeroTitleBlockProps {
  title: ReactNode
  detail?: ReactNode
  /** Overrides underline colour; defaults to `bg-accent`. */
  brandColour?: string
  titleAs?: "h1" | "h2"
}

export function PageHeroTitleBlock({
  title,
  detail,
  brandColour,
  titleAs: TitleTag = "h1",
}: PageHeroTitleBlockProps) {
  return (
    <div className="min-w-0 flex-1 space-y-0">
      <TitleTag className="text-[26px] font-extrabold tracking-tight text-foreground">{title}</TitleTag>
      <span
        className={cn("mt-2 block h-1 w-[60px] rounded-pill", !brandColour && "bg-accent")}
        style={brandColour ? ({ backgroundColor: brandColour } satisfies CSSProperties) : undefined}
        aria-hidden
      />
      {detail != null ? (
        <div className="mt-2 max-w-[380px] space-y-1 text-[13px] leading-relaxed text-muted-foreground [&_p]:leading-relaxed">
          {detail}
        </div>
      ) : null}
    </div>
  )
}

export interface PageHeroShellProps {
  brandColour?: string
  className?: string
  children: ReactNode
}

export function PageHeroShell({ brandColour: _brandColour, className, children }: PageHeroShellProps) {
  return (
    <div className={cn("w-full", className)}>
      <section className="relative w-full overflow-hidden rounded-frame border border-border bg-background">
        <BrandMarkWatermark />
        {children}
      </section>
    </div>
  )
}
