"use client"

import { PACING_UI_STATUS, TONE_DOT, TONE_TEXT } from "@/lib/design/status"
import { statusLegendItems, type StatusLegendItem } from "@/lib/pacing/status"
import { cn } from "@/lib/utils"

/**
 * Defines all six pacing UI states and their thresholds.
 * Place with the summary tiles so the vocabulary is never implied.
 */
export function StatusLegend({
  className,
  items,
}: {
  className?: string
  items?: StatusLegendItem[]
}) {
  const resolved = items ?? statusLegendItems()
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-card p-3 shadow-e0",
        className,
      )}
      role="region"
      aria-label="Pacing status definitions"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Status legend
      </p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {resolved.map((item) => {
          const tone = PACING_UI_STATUS[item.status].tone
          return (
            <li key={item.status} className="flex gap-2 text-xs leading-snug">
              <span
                className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])}
                aria-hidden
              />
              <span>
                <span className={cn("font-semibold", TONE_TEXT[tone])}>{item.label}</span>
                <span className="text-muted-foreground"> — {item.definition}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
