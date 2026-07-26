import type {
  AdServingChannelFamily,
  AdServingLineItemStatus,
} from "@/lib/pacing/ad-serving/types"
import type { DirectBurstStatus, DirectCampaignGroup } from "@/lib/pacing/direct/types"
import type { ProgrammaticChannelFamily } from "@/lib/pacing/programmatic/types"
import type { PacingFilterStatusBand } from "@/lib/pacing/pacingFilters"

export type PacingRowFilterAccessors<T> = {
  clientName: (row: T) => string
  mediaType: (row: T) => string
  status: (row: T) => PacingFilterStatusBand
  searchText: (row: T) => string
}

/** In-memory filter dimensions only — as_of_date is server-side (`asOfDate` query). */
export type PacingRowFilterInput = {
  client_ids: string[]
  media_types: string[]
  statuses: string[]
  search: string
}

function norm(value: string): string {
  return value.trim().toLowerCase()
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

export function applyPacingRowFilters<T>(
  rows: T[],
  filters: PacingRowFilterInput,
  accessors: PacingRowFilterAccessors<T>,
  clientIdToName: Map<string, string>,
): T[] {
  // Skip client filter until the id→name map has loaded (avoids empty flash).
  const clientNames =
    filters.client_ids.length > 0 && clientIdToName.size > 0
      ? selectedClientNames(filters.client_ids, clientIdToName)
      : null
  const mediaSet =
    filters.media_types.length > 0 ? new Set(filters.media_types.map(norm)) : null
  const statusSet =
    filters.statuses.length > 0 ? new Set(filters.statuses.map(norm)) : null
  const searchQ = filters.search.trim() ? norm(filters.search) : null

  return rows.filter((row) => {
    if (clientNames && !clientNames.has(norm(accessors.clientName(row)))) {
      return false
    }
    if (mediaSet && !mediaSet.has(norm(accessors.mediaType(row)))) {
      return false
    }
    if (statusSet && !statusSet.has(norm(accessors.status(row)))) {
      return false
    }
    if (searchQ && !norm(accessors.searchText(row)).includes(searchQ)) {
      return false
    }
    return true
  })
}

export function mapProgrammaticChannelFamilyToMediaType(
  family: ProgrammaticChannelFamily,
): string {
  switch (family) {
    case "progDisplay":
      return "display"
    case "progVideo":
      return "video"
    case "progBvod":
      return "bvod"
    case "progAudio":
      return "audio"
    case "progOoh":
      return "ooh"
    default: {
      const _exhaustive: never = family
      return _exhaustive
    }
  }
}

export function mapAdServingChannelFamilyToMediaType(
  family: AdServingChannelFamily,
): string {
  switch (family) {
    case "digitalDisplay":
      return "display"
    case "digitalVideo":
      return "video"
    case "digitalAudio":
      return "audio"
    case "bvod":
      return "bvod"
    default: {
      const _exhaustive: never = family
      return _exhaustive
    }
  }
}

export function mapAdServingStatusToBand(
  status: AdServingLineItemStatus,
): PacingFilterStatusBand {
  switch (status) {
    case "serving":
      return "on-track"
    case "no-data":
      return "no-data"
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

/**
 * Direct burst/line status → filter band.
 * FLAGGED: `"mixed"` has no single clean band (overview uses burst statuses);
 * treated as `"no-data"` here so it stays selectable without guessing.
 */
export function mapDirectStatusToBand(
  status: DirectBurstStatus | "mixed",
): PacingFilterStatusBand {
  switch (status) {
    case "completed_under":
      return "behind"
    case "completed_over":
      return "ahead"
    case "in_progress":
    case "completed":
      return "on-track"
    case "pending":
    case "mixed":
      return "no-data"
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

export function filterDirectCampaignGroups(
  groups: DirectCampaignGroup[],
  filters: PacingRowFilterInput,
  clientIdToName: Map<string, string>,
): DirectCampaignGroup[] {
  const statusFiltered = groups
    .map((group) => {
      const lineItems = applyPacingRowFilters(
        group.lineItems,
        {
          client_ids: [],
          media_types: [],
          statuses: filters.statuses,
          search: "",
        },
        {
          clientName: () => group.clientName,
          mediaType: () => "direct",
          status: (li) => mapDirectStatusToBand(li.lineItemStatus),
          searchText: () => "",
        },
        clientIdToName,
      )
      return { ...group, lineItems }
    })
    .filter((group) => group.lineItems.length > 0)

  return applyPacingRowFilters(
    statusFiltered,
    {
      client_ids: filters.client_ids,
      media_types: filters.media_types,
      statuses: [],
      search: filters.search,
    },
    {
      clientName: (g) => g.clientName,
      mediaType: () => "direct",
      status: () => "on-track",
      searchText: (g) =>
        [
          g.clientName,
          g.campaignName,
          g.mbaNumber,
          ...g.lineItems.flatMap((li) => [li.lineItemId, li.lineItemName]),
        ].join(" "),
    },
    clientIdToName,
  )
}
