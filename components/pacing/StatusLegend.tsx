"use client"

import { statusLegendItems, type PacingColourRole } from "@/lib/pacing/status"
import { cn } from "@/lib/utils"

function roleDotClass(role: PacingColourRole): string {
  switch (role) {
    case "ok":
      return "bg-pacing-on-track"
    case "attention":
      return "bg-status-attention"
    case "problem":
      return "bg-pacing-critical"
  }
}

/**
 * Defines all six pacing UI states and their thresholds.
 * Place with the summary tiles so the vocabulary is never implied.
 */
export function StatusLegend({ className }: { className?: string }) {
  const items = statusLegendItems()
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
        {items.map((item) => (
          <li key={item.status} className="flex gap-2 text-xs leading-snug">
            <span
              className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", roleDotClass(item.role))}
              aria-hidden
            />
            <span>
              <span className={cn("font-semibold", item.textClass)}>{item.label}</span>
              <span className="text-muted-foreground"> — {item.definition}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
