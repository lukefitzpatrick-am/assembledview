"use client"

import { countPortfolioRows } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import type { PortfolioTileKey } from "@/lib/pacing/portfolio/filterPortfolioRows"
import type { CampaignPacingRow, PortfolioPacingCounts } from "@/lib/pacing/portfolio/types"
import { cn } from "@/lib/utils"

const TILES: Array<{
  key: PortfolioTileKey
  label: string
  countKey: keyof PortfolioPacingCounts
  tone: string
}> = [
  { key: "live", label: "Live campaigns", countKey: "live", tone: "text-foreground" },
  { key: "behind", label: "Behind", countKey: "behind", tone: "text-status-behind-fg" },
  { key: "on_track", label: "On track", countKey: "on_track", tone: "text-status-on-track-fg" },
  { key: "ahead", label: "Ahead", countKey: "ahead", tone: "text-status-ahead-fg" },
  { key: "over_pacing", label: "Over-pacing", countKey: "over_pacing", tone: "text-status-critical-fg" },
  { key: "attention", label: "Needs attention", countKey: "attention", tone: "text-status-attention-fg" },
]

export function PortfolioStatusTiles({
  rows,
  counts,
  tile,
  onToggle,
}: {
  rows: CampaignPacingRow[]
  counts?: PortfolioPacingCounts
  tile: PortfolioTileKey | null
  onToggle: (key: PortfolioTileKey) => void
}) {
  const tileCounts = counts ?? countPortfolioRows(rows)

  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      role="toolbar"
      aria-label="Filter portfolio by pace"
    >
      {TILES.map((item) => {
        const selected = tile === item.key
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(item.key)}
            className={cn(
              "interactive rounded-card border bg-card p-3 text-left shadow-e0",
              selected ? "border-foreground" : "border-border",
            )}
          >
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {item.label}
            </span>
            <span className={cn("num mt-0.5 block text-2xl font-semibold", item.tone)}>
              {tileCounts[item.countKey]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
