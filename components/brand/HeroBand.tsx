import type { ReactNode } from "react"

import { withFullStop } from "@/components/layout/PageHeader"
import { cn } from "@/lib/utils"

/** Forest-light outline for a secondary button sitting on the ink band. */
export const heroBandSecondaryClassName =
  "border-am-forest-light text-am-white hover:bg-am-panel hover:text-am-white dark:text-am-white dark:hover:text-am-white"

export type HeroBandProps = {
  chips?: ReactNode
  title: ReactNode
  /** Serif phrase after the title. The full stop lands here when `punctuate` is on. */
  accent?: string
  punctuate?: boolean
  meta?: ReactNode
  journey?: ReactNode
  actions?: ReactNode
  arches?: ReactNode
  as?: "h1" | "h2"
  className?: string
}

export function HeroBand({
  chips,
  title,
  accent,
  punctuate = true,
  meta,
  journey,
  actions,
  arches,
  as: TitleTag = "h2",
  className,
}: HeroBandProps) {
  const accentText = accent && punctuate ? withFullStop(accent) : accent

  return (
    <div
      className={cn(
        "grid grid-cols-1 items-end gap-6 rounded-frame bg-am-ink p-7 text-am-white motion-reduce:[&_*]:animate-none motion-reduce:[&_*]:transition-none min-[980px]:grid-cols-[minmax(0,1fr)_auto]",
        className,
      )}
    >
      <div className="min-w-0">
        {chips ? <div className="mb-4 flex flex-wrap items-center gap-2.5">{chips}</div> : null}
        <TitleTag className="text-balance text-[28px] font-extrabold leading-[1.1] tracking-tight text-am-white sm:text-[32px]">
          {title}
          {accentText ? (
            <>
              {" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-normal">
                {accentText}
              </span>
            </>
          ) : null}
        </TitleTag>
        {meta ? (
          <div className="mt-2.5 flex flex-wrap gap-x-[18px] gap-y-1 text-[13px] text-am-muted-on-black [&_b]:font-semibold [&_b]:text-am-white">
            {meta}
          </div>
        ) : null}
        {journey ? <div className="mt-5">{journey}</div> : null}
      </div>
      {arches || actions ? (
        <div className="flex flex-col items-end gap-[18px]">
          {arches}
          {actions ? (
            <div className="flex flex-wrap items-center justify-end gap-2.5">{actions}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
