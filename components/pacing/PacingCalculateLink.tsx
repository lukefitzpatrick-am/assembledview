"use client"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { portfolioLegendItems } from "@/lib/pacing/portfolio/portfolioPresentation"

/** The five portfolio legend lines, opened from the pacing lede. */
export function PacingCalculateLink() {
  const items = portfolioLegendItems()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          How we calculate
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 rounded-card p-3 shadow-e2">
        <ul className="space-y-2 text-xs leading-snug">
          {items.map((item) => (
            <li key={item.status}>
              <span className="font-semibold text-foreground">{item.label}.</span>{" "}
              <span className="text-muted-foreground">{item.definition}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
