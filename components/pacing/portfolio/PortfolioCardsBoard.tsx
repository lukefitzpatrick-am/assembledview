"use client"

import { useMemo, useState } from "react"
import { StatusLegend } from "@/components/pacing/StatusLegend"
import { CampaignPacingCard } from "@/components/pacing/portfolio/CampaignPacingCard"
import { EmptyState } from "@/components/ui/states"
import { countPortfolioRows } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import {
  filterPortfolioByTile,
  splitPortfolioSections,
  type PortfolioTileKey,
} from "@/lib/pacing/portfolio/filterPortfolioRows"
import { portfolioLegendItems } from "@/lib/pacing/portfolio/portfolioPresentation"
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

const GRID_CLASS =
  "grid grid-cols-1 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3 gap-3.5"

export function PortfolioCardsBoard({
  rows,
  asOf,
  counts,
}: {
  rows: CampaignPacingRow[]
  asOf: string
  counts?: PortfolioPacingCounts
}) {
  const [tile, setTile] = useState<PortfolioTileKey | null>(null)
  const tileCounts = counts ?? countPortfolioRows(rows)
  const visible = useMemo(() => filterPortfolioByTile(rows, tile), [rows, tile])
  const { attention, rest } = useMemo(() => splitPortfolioSections(visible), [visible])

  function toggleTile(key: PortfolioTileKey) {
    setTile((prev) => (prev === key ? null : key))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
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
                onClick={() => toggleTile(item.key)}
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
        <StatusLegend items={portfolioLegendItems()} />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No campaigns match"
          message="Clear the tile or toolbar filters to see more campaigns."
        />
      ) : (
        <>
          {attention.length > 0 ? (
            <section aria-label="Needs a look today">
              <h2 className="mb-2.5 text-sm font-semibold text-foreground">
                Needs a look today{" "}
                <span className="font-normal text-muted-foreground">{attention.length}</span>
              </h2>
              <div className={GRID_CLASS}>
                {attention.map((row) => (
                  <CampaignPacingCard
                    key={row.mbaNumber}
                    row={row}
                    asOf={asOf}
                    showWhy
                  />
                ))}
              </div>
            </section>
          ) : null}
          {rest.length > 0 ? (
            <section aria-label="Everything else">
              <h2 className="mb-2.5 text-sm font-semibold text-foreground">
                Everything else{" "}
                <span className="font-normal text-muted-foreground">{rest.length}</span>
              </h2>
              <div className={GRID_CLASS}>
                {rest.map((row) => (
                  <CampaignPacingCard
                    key={row.mbaNumber}
                    row={row}
                    asOf={asOf}
                    showWhy={false}
                    muted
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
