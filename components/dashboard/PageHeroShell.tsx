"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export const PAGE_HERO_PADDING = "p-6 md:p-7"
export const PAGE_HERO_PADDING_COMPACT = "p-5 md:p-6"

export interface PageHeroTitleBlockProps {
  title: ReactNode
  detail?: ReactNode
  /** Ignored since 05b (D4): client colour stays on the client mark. */
  brandColour?: string
  titleAs?: "h1" | "h2"
  /** Serif italic phrase after the title. No automatic full stop — hero titles are often entity names. */
  accent?: string
}

export function PageHeroTitleBlock({
  title,
  detail,
  titleAs: TitleTag = "h1",
  accent,
}: PageHeroTitleBlockProps) {
  return (
    <div className="min-w-0 flex-1 space-y-0">
      <TitleTag className="text-balance break-words text-[28px] font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-[32px] lg:text-[36px]">
        {title}
        {accent ? (
          <>
            {" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-normal">{accent}</span>
          </>
        ) : null}
      </TitleTag>
      {detail != null ? (
        <div className="mt-2 max-w-[62ch] min-w-0 break-words space-y-1 text-[14px] leading-relaxed text-muted-foreground [&_p]:leading-relaxed">
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
      <section className="relative w-full overflow-hidden rounded-frame border border-border bg-card">
        {children}
      </section>
    </div>
  )
}
