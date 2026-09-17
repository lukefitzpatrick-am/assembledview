"use client"

import {
  countLineCardTiles,
  type LineCardTileKey,
} from "@/lib/pacing/channel/lineCardTiles"
import type { LineCardModel } from "@/lib/pacing/channel/lineCardTypes"
import { cn } from "@/lib/utils"

const TILES: Array<{
  key: LineCardTileKey
  label: string
  tone: string
}> = [
  { key: "live", label: "Live lines", tone: "text-foreground" },
  { key: "behind", label: "Behind", tone: "text-status-behind-fg" },
  { key: "on_track", label: "On track", tone: "text-status-on-track-fg" },
  { key: "ahead", label: "Ahead", tone: "text-status-ahead-fg" },
  { key: "over_pacing", label: "Over-pacing", tone: "text-status-critical-fg" },
  { key: "kpi_pending", label: "KPI pending", tone: "text-status-attention-fg" },
]

export function ChannelStatusTiles({
  models,
  tile,
  onToggle,
}: {
  models: LineCardModel[]
  tile: LineCardTileKey | null
  onToggle: (key: LineCardTileKey) => void
}) {
  const counts = countLineCardTiles(models)

  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      role="toolbar"
      aria-label="Filter lines by pace"
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
              {counts[item.key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
