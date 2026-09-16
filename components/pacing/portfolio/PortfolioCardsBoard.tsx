"use client"

import { useMemo, useState } from "react"
import { StatusLegend } from "@/components/pacing/StatusLegend"
import { CampaignPacingCard } from "@/components/pacing/portfolio/CampaignPacingCard"
import { CampaignPacingTable } from "@/components/pacing/portfolio/CampaignPacingTable"
import { PortfolioStatusTiles } from "@/components/pacing/portfolio/PortfolioStatusTiles"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/states"
import { Download } from "lucide-react"
import { downloadPortfolioCsv } from "@/lib/pacing/portfolio/portfolioCsv"
import {
  filterPortfolioByTile,
  splitPortfolioSections,
  type PortfolioTileKey,
} from "@/lib/pacing/portfolio/filterPortfolioRows"
import type { PortfolioLayout } from "@/lib/pacing/portfolio/portfolioLayout"
import { portfolioLegendItems } from "@/lib/pacing/portfolio/portfolioPresentation"
import type { CampaignPacingRow, PortfolioPacingCounts } from "@/lib/pacing/portfolio/types"

const GRID_CLASS =
  "grid grid-cols-1 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3 gap-3.5"

export function PortfolioCardsBoard({
  rows,
  asOf,
  counts,
  layout = "cards",
}: {
  rows: CampaignPacingRow[]
  asOf: string
  counts?: PortfolioPacingCounts
  layout?: PortfolioLayout
}) {
  const [tile, setTile] = useState<PortfolioTileKey | null>(null)
  const visible = useMemo(() => filterPortfolioByTile(rows, tile), [rows, tile])
  const { attention, rest } = useMemo(() => splitPortfolioSections(visible), [visible])

  function toggleTile(key: PortfolioTileKey) {
    setTile((prev) => (prev === key ? null : key))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <PortfolioStatusTiles rows={rows} counts={counts} tile={tile} onToggle={toggleTile} />
        <StatusLegend items={portfolioLegendItems()} />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No campaigns match"
          message="Clear the tile or toolbar filters to see more campaigns."
        />
      ) : layout === "table" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadPortfolioCsv(visible, asOf)}
            >
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
          </div>
          <CampaignPacingTable rows={visible} />
        </div>
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
