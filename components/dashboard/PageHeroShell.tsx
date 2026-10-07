"use client"

import type { ReactNode } from "react"

import { withFullStop } from "@/components/layout/PageHeader"
import { cn } from "@/lib/utils"

export const PAGE_HERO_PADDING = "p-6 md:p-7"
export const PAGE_HERO_PADDING_COMPACT = "p-5 md:p-6"

export interface PageHeroTitleBlockProps {
  title: ReactNode
  detail?: ReactNode
  /** @deprecated Client colour paints only EntityMark. */
  brandColour?: string
  titleAs?: "h1" | "h2"
  /** Serif italic phrase after the title. */
  accent?: string
  /** Page titles take a full stop. Entity names pass false. */
  punctuate?: boolean
  /** Campaign cover uses ink. Card heroes stay on the default surface. */
  surface?: "card" | "ink"
}

export function PageHeroTitleBlock({
  title,
  detail,
  titleAs: TitleTag = "h1",
  accent,
  punctuate = true,
  surface = "card",
}: PageHeroTitleBlockProps) {
  const heading = punctuate && typeof title === "string" ? withFullStop(title) : title
  const accentText = punctuate && accent ? withFullStop(accent) : accent
  const onInk = surface === "ink"

  return (
    <div className="min-w-0 flex-1 space-y-0">
      <TitleTag
        className={cn(
          "text-balance break-words text-[28px] font-extrabold leading-[1.1] tracking-tight sm:text-[32px] lg:text-[36px]",
          onInk ? "text-am-white" : "text-foreground",
        )}
      >
        {heading}
        {accentText ? (
          <>
            {" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-normal">{accentText}</span>
          </>
        ) : null}
      </TitleTag>
      {detail != null ? (
        <div
          className={cn(
            "mt-2 max-w-[62ch] min-w-0 break-words space-y-1 text-[14px] leading-relaxed [&_p]:leading-relaxed",
            onInk ? "text-am-muted-on-black" : "text-muted-foreground",
          )}
        >
          {detail}
        </div>
      ) : null}
    </div>
  )
}

export interface PageHeroShellProps {
  /** @deprecated Client colour paints only EntityMark. */
  brandColour?: string
  className?: string
  children: ReactNode
}

export function PageHeroShell({ brandColour: _brandColour, className, children }: PageHeroShellProps) {
  return (
    <div className={cn("w-full", className)}>
      <section className="relative w-full overflow-hidden rounded-frame border border-border bg-card">
        {children}
      </section>
    </div>
  )
}
