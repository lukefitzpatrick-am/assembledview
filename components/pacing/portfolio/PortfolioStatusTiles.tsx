"use client"

import { PACING_TILE, TONE_TEXT, type Tone } from "@/lib/design/status"
import { countPortfolioRows } from "@/lib/pacing/portfolio/portfolioRowFlags"
import type { PortfolioTileKey } from "@/lib/pacing/portfolio/filterPortfolioRows"
import type { CampaignPacingRow, PortfolioPacingCounts } from "@/lib/pacing/portfolio/types"
import { cn } from "@/lib/utils"

const portfolioTileTones = PACING_TILE satisfies Record<
  PortfolioTileKey,
  { tone: Tone | null; label?: string }
>

const TILES: Array<{
  key: PortfolioTileKey
  label: string
  countKey: keyof PortfolioPacingCounts
}> = [
  { key: "live", label: "Live", countKey: "live" },
  { key: "behind", label: "Behind", countKey: "behind" },
  { key: "on_track", label: "On track", countKey: "on_track" },
  { key: "ahead", label: "Ahead", countKey: "ahead" },
  { key: "over_pacing", label: "Over-pacing", countKey: "over_pacing" },
  { key: "attention", label: "Needs attention", countKey: "attention" },
]

function tileFigureClass(key: PortfolioTileKey): string {
  const tone = portfolioTileTones[key].tone
  return tone == null ? "text-foreground" : TONE_TEXT[tone]
}

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
              "interactive rounded-card border p-3 text-left",
              selected
                ? "border-am-ink bg-am-ink text-am-white"
                : "border-border bg-card",
            )}
          >
            <span
              className={cn(
                "text-[10px] uppercase tracking-wide",
                selected ? "text-am-white" : "text-muted-foreground",
              )}
            >
              {item.label}
            </span>
            <span
              className={cn(
                "num mt-0.5 block text-2xl font-semibold",
                selected ? "text-am-white" : tileFigureClass(item.key),
              )}
            >
              {tileCounts[item.countKey]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
