import type { ReactNode } from "react"

import { withFullStop } from "@/components/layout/PageHeader"

export interface SectionProps {
  title: ReactNode
  accent?: string
  description?: ReactNode
  actions?: ReactNode
  as?: "h2" | "h3"
  /** Default true. Entity names pass false. */
  punctuate?: boolean
  className?: string
  children?: ReactNode
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

export function Section({
  title,
  accent,
  description,
  actions,
  as: TitleTag = "h2",
  punctuate = true,
  className,
  children,
}: SectionProps) {
  const heading = punctuatedHeading(title, accent, punctuate)

  return (
    <section className={className}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <TitleTag className="text-[20px] font-extrabold leading-tight tracking-tight text-foreground">
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
          {description ? (
            <p className="mt-1 text-[14px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
