"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Download } from "lucide-react"
import { LinePacingCard } from "@/components/pacing/channel/LinePacingCard"
import { ChannelStatusTiles } from "@/components/pacing/channel/ChannelStatusTiles"
import { StatusLegend } from "@/components/pacing/StatusLegend"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/states"
import { downloadLineCardCsv } from "@/lib/pacing/channel/lineCardCsv"
import {
  filterItemsByTile,
  type LineCardTileKey,
} from "@/lib/pacing/channel/lineCardTiles"
import type { ChannelTabKey, LineCardModel } from "@/lib/pacing/channel/lineCardTypes"
import type { ChannelLayout } from "@/lib/pacing/channel/channelLayout"
import { portfolioLegendItems } from "@/lib/pacing/portfolio/portfolioPresentation"

const GRID_CLASS =
  "grid grid-cols-1 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3 gap-3.5"

export type ChannelBoardItem<T> = {
  model: LineCardModel
  row: T
}

export function ChannelPacingBoard<T>({
  items,
  asOf,
  channel,
  layout = "cards",
  renderTable,
}: {
  items: ChannelBoardItem<T>[]
  asOf: string
  channel: ChannelTabKey
  layout?: ChannelLayout
  renderTable: (rows: T[]) => ReactNode
}) {
  const [tile, setTile] = useState<LineCardTileKey | null>(null)
  const visible = useMemo(() => filterItemsByTile(items, tile), [items, tile])
  const models = useMemo(() => items.map((item) => item.model), [items])

  function toggleTile(key: LineCardTileKey) {
    setTile((prev) => (prev === key ? null : key))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <ChannelStatusTiles models={models} tile={tile} onToggle={toggleTile} />
        <StatusLegend items={portfolioLegendItems()} />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No lines match"
          message="Clear the tile or toolbar filters to see more line items."
        />
      ) : layout === "table" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadLineCardCsv(
                  visible.map((item) => item.model),
                  asOf,
                  channel,
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
          </div>
          {renderTable(visible.map((item) => item.row))}
        </div>
      ) : (
        <div className={GRID_CLASS}>
          {visible.map((item) => (
            <LinePacingCard key={item.model.lineItemId} model={item.model} asOf={asOf} />
          ))}
        </div>
      )}
    </div>
  )
}
