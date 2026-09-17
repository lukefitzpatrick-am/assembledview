import type { LineCardModel, LineCardPace } from "./lineCardTypes"

export type LineCardTileKey =
  | "live"
  | "behind"
  | "on_track"
  | "ahead"
  | "over_pacing"
  | "kpi_pending"

export type LineCardTileCounts = {
  live: number
  behind: number
  on_track: number
  ahead: number
  over_pacing: number
  kpi_pending: number
}

export function countLineCardTiles(models: LineCardModel[]): LineCardTileCounts {
  return {
    live: models.length,
    behind: models.filter((row) => row.pace === "behind").length,
    on_track: models.filter((row) => row.pace === "on_track").length,
    ahead: models.filter((row) => row.pace === "ahead").length,
    over_pacing: models.filter((row) => row.pace === "over_pacing").length,
    kpi_pending: models.filter((row) => row.kpiStatus === "kpi-pending").length,
  }
}

export function tileMatchesPace(tile: LineCardTileKey, pace: LineCardPace): boolean {
  if (tile === "live") return true
  if (tile === "kpi_pending") return false
  return pace === tile
}

export function filterLineCardsByTile(
  models: LineCardModel[],
  tile: LineCardTileKey | null,
): LineCardModel[] {
  if (!tile || tile === "live") return models
  if (tile === "kpi_pending") return models.filter((row) => row.kpiStatus === "kpi-pending")
  return models.filter((row) => row.pace === tile)
}

export function filterItemsByTile<T>(
  items: Array<{ model: LineCardModel; row: T }>,
  tile: LineCardTileKey | null,
): Array<{ model: LineCardModel; row: T }> {
  if (!tile || tile === "live") return items
  if (tile === "kpi_pending") return items.filter((item) => item.model.kpiStatus === "kpi-pending")
  return items.filter((item) => item.model.pace === tile)
}
