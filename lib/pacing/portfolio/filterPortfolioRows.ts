import {
  isPacingClientFilterUnresolved,
  type PacingRowFilterInput,
} from "@/lib/pacing/filters/applyPacingRowFilters"
import type { PacingFilterStatusBand } from "@/lib/pacing/pacingFilters"
import { matchText, normalizeSearchText } from "@/lib/search/matchText"
import { isAttentionRow, isOverPacing } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import type { CampaignPacingRow } from "@/lib/pacing/portfolio/types"

export type PortfolioTileKey =
  | "live"
  | "behind"
  | "on_track"
  | "ahead"
  | "over_pacing"
  | "attention"

function norm(value: string): string {
  return normalizeSearchText(value)
}

function selectedClientNames(
  clientIds: string[],
  clientIdToName: Map<string, string>,
): Set<string> {
  const names = new Set<string>()
  for (const id of clientIds) {
    const name = clientIdToName.get(id)
    if (name) names.add(norm(name))
  }
  return names
}

export function portfolioRowStatusBand(row: CampaignPacingRow): PacingFilterStatusBand {
  if (isOverPacing(row)) return "over-pacing"
  switch (row.pace) {
    case "behind":
    case "no_delivery":
      return "behind"
    case "on_track":
      return "on-track"
    case "ahead":
      return "ahead"
    case "no_source":
    case "not_started":
      return "no-data"
    default: {
      const _exhaustive: never = row.pace
      return _exhaustive
    }
  }
}

export function channelMatchesMediaType(channelKey: string, mediaType: string): boolean {
  const key = channelKey.toLowerCase()
  switch (mediaType) {
    case "search":
      return key === "search" || key.startsWith("search")
    case "social":
      return key.startsWith("social")
    case "display":
      return key.includes("display")
    case "video":
      return key.includes("video") && !key.includes("bvod")
    case "audio":
      return key.includes("audio")
    case "bvod":
      return key.includes("bvod")
    case "ooh":
      return key.includes("ooh")
    case "direct":
      return key === "direct"
    default:
      return key === mediaType.toLowerCase()
  }
}

export function campaignMatchesMediaTypes(
  row: CampaignPacingRow,
  mediaTypes: string[],
): boolean {
  if (mediaTypes.length === 0) return true
  return row.channels.some((ch) =>
    mediaTypes.some((media) => channelMatchesMediaType(ch.channelKey, media)),
  )
}

export function filterPortfolioRows(
  rows: CampaignPacingRow[],
  filters: PacingRowFilterInput,
  clientIdToName: Map<string, string>,
): CampaignPacingRow[] {
  if (isPacingClientFilterUnresolved(filters.client_ids, clientIdToName)) {
    return []
  }

  const clientNames =
    filters.client_ids.length > 0
      ? selectedClientNames(filters.client_ids, clientIdToName)
      : null
  const statusSet =
    filters.statuses.length > 0 ? new Set(filters.statuses.map(norm)) : null
  const searchQ = filters.search.trim() ? filters.search : null

  return rows.filter((row) => {
    if (clientNames && !clientNames.has(norm(row.clientName))) return false
    if (!campaignMatchesMediaTypes(row, filters.media_types)) return false
    if (statusSet && !statusSet.has(norm(portfolioRowStatusBand(row)))) return false
    if (
      searchQ &&
      !matchText(
        [row.clientName, row.campaignName, row.mbaNumber, ...row.channels.map((ch) => ch.label)].join(
          " ",
        ),
        searchQ,
      )
    ) {
      return false
    }
    return true
  })
}

export function filterPortfolioByTile(
  rows: CampaignPacingRow[],
  tile: PortfolioTileKey | null,
): CampaignPacingRow[] {
  if (!tile || tile === "live") return rows
  if (tile === "behind") return rows.filter((row) => row.pace === "behind")
  if (tile === "on_track") return rows.filter((row) => row.pace === "on_track")
  if (tile === "ahead") return rows.filter((row) => row.pace === "ahead")
  if (tile === "over_pacing") return rows.filter(isOverPacing)
  return rows.filter(isAttentionRow)
}

export function splitPortfolioSections(rows: CampaignPacingRow[]): {
  attention: CampaignPacingRow[]
  rest: CampaignPacingRow[]
} {
  const attention: CampaignPacingRow[] = []
  const rest: CampaignPacingRow[] = []
  for (const row of rows) {
    if (isAttentionRow(row)) attention.push(row)
    else rest.push(row)
  }
  return { attention, rest }
}
