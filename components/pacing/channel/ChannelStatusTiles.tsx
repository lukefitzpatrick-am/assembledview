"use client"

import { PACING_TILE, TONE_TEXT, type Tone } from "@/lib/design/status"
import {
  countLineCardTiles,
  type LineCardTileKey,
} from "@/lib/pacing/channel/lineCardTiles"
import type { LineCardModel } from "@/lib/pacing/channel/lineCardTypes"
import { cn } from "@/lib/utils"

const lineCardTileTones = PACING_TILE satisfies Record<
  LineCardTileKey,
  { tone: Tone | null; label?: string }
>

const TILES: Array<{
  key: LineCardTileKey
  label: string
}> = [
  { key: "live", label: "Live lines" },
  { key: "behind", label: "Behind" },
  { key: "on_track", label: "On track" },
  { key: "ahead", label: "Ahead" },
  { key: "over_pacing", label: "Over-pacing" },
  { key: "kpi_pending", label: "KPI pending" },
]

function tileFigureClass(key: LineCardTileKey): string {
  const tone = lineCardTileTones[key].tone
  return tone == null ? "text-foreground" : TONE_TEXT[tone]
}

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
            <span className={cn("num mt-0.5 block text-2xl font-semibold", tileFigureClass(item.key))}>
              {counts[item.key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
