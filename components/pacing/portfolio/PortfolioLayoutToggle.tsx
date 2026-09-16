"use client"

import { Segmented, SegmentedItem } from "@/components/ui/segmented"
import {
  usePortfolioLayout,
  type PortfolioLayout,
} from "@/lib/pacing/portfolio/portfolioLayout"
import { cn } from "@/lib/utils"

export function PortfolioLayoutToggle({ className }: { className?: string }) {
  const { layout, setLayout } = usePortfolioLayout()

  return (
    <Segmented
      value={layout}
      onValueChange={(value) => {
        if (value === "cards" || value === "table") setLayout(value)
      }}
      aria-label="Portfolio layout"
      className={cn("shrink-0", className)}
    >
      <SegmentedItem value="cards">Cards</SegmentedItem>
      <SegmentedItem value="table">Table</SegmentedItem>
    </Segmented>
  )
}

export type { PortfolioLayout }
