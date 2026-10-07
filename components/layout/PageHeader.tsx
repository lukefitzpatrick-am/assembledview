import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const TERMINAL_PUNCTUATION = /[.!?…]$/

/** Adds a full stop unless the string already ends in . ! ? or an ellipsis. */
export function withFullStop(text: string): string {
  if (TERMINAL_PUNCTUATION.test(text)) return text
  return `${text}.`
}

export interface PageHeaderProps {
  title: ReactNode
  /** Serif italic phrase rendered after the title. */
  accent?: string
  lede?: ReactNode
  /** Small row under the lede. */
  meta?: ReactNode
  actions?: ReactNode
  as?: "h1" | "h2"
  /** Default true. Entity names pass false. */
  punctuate?: boolean
  className?: string
}

function punctuatedHeading(
  title: ReactNode,
  accent: string | undefined,
  punctuate: boolean,
): { title: ReactNode; accent?: string } {
  if (!punctuate) return { title, accent }
  if (accent) return { title, accent: withFullStop(accent) }
  if (typeof title === "string") return { title: withFullStop(title) }
  return { title }
}

export function PageHeader({
  title,
  accent,
  lede,
  meta,
  actions,
  as: TitleTag = "h1",
  punctuate = true,
  className,
}: PageHeaderProps) {
  const heading = punctuatedHeading(title, accent, punctuate)

  return (
    <div className={cn("flex flex-wrap justify-between gap-x-8 gap-y-4", className)}>
      <div className="min-w-0 grow">
        <TitleTag className="text-balance break-words text-[28px] font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-[32px] lg:text-[36px]">
          {heading.title}
          {heading.accent ? (
            <>
              {" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-normal">
                {heading.accent}
              </span>
            </>
          ) : null}
        </TitleTag>
        {lede ? (
          <div className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-text-secondary">{lede}</div>
        ) : null}
        {meta ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>
      ) : null}
    </div>
  )
}
