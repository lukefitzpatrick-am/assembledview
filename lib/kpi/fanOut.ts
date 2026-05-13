import { buildLineItemIdentity, MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import type { CampaignKPI, ResolvedKPIRow } from "./types"

export type LineItemForKpiFanout = Record<string, unknown> & {
  line_item_id?: string
  lineItemId?: string
  platform?: string
  bid_strategy?: string
  bidStrategy?: string
}

function norm(s: string | undefined | null) {
  return String(s ?? "").trim().toLowerCase()
}

/**
 * Maps `ResolvedKPIRow.media_type` (resolver / workbook keys) to the same
 * `MEDIA_TYPE_ID_CODES` entry used by `save*LineItems` in `lib/api.ts`.
 */
export function idCodeForKpiMediaType(
  mediaType: string,
): (typeof MEDIA_TYPE_ID_CODES)[keyof typeof MEDIA_TYPE_ID_CODES] | null {
  const k = norm(mediaType)
  const map: Record<string, (typeof MEDIA_TYPE_ID_CODES)[keyof typeof MEDIA_TYPE_ID_CODES]> = {
    television: MEDIA_TYPE_ID_CODES.television,
    radio: MEDIA_TYPE_ID_CODES.radio,
    newspaper: MEDIA_TYPE_ID_CODES.newspaper,
    magazines: MEDIA_TYPE_ID_CODES.magazines,
    ooh: MEDIA_TYPE_ID_CODES.ooh,
    cinema: MEDIA_TYPE_ID_CODES.cinema,
    digidisplay: MEDIA_TYPE_ID_CODES.digitalDisplay,
    digitaldisplay: MEDIA_TYPE_ID_CODES.digitalDisplay,
    digiaudio: MEDIA_TYPE_ID_CODES.digitalAudio,
    digitalaudio: MEDIA_TYPE_ID_CODES.digitalAudio,
    digivideo: MEDIA_TYPE_ID_CODES.digitalVideo,
    digitalvideo: MEDIA_TYPE_ID_CODES.digitalVideo,
    bvod: MEDIA_TYPE_ID_CODES.bvod,
    integration: MEDIA_TYPE_ID_CODES.integration,
    search: MEDIA_TYPE_ID_CODES.search,
    socialmedia: MEDIA_TYPE_ID_CODES.socialMedia,
    progdisplay: MEDIA_TYPE_ID_CODES.progDisplay,
    progvideo: MEDIA_TYPE_ID_CODES.progVideo,
    progbvod: MEDIA_TYPE_ID_CODES.progBVOD,
    progaudio: MEDIA_TYPE_ID_CODES.progAudio,
    progooh: MEDIA_TYPE_ID_CODES.progOOH,
    influencers: MEDIA_TYPE_ID_CODES.influencers,
  }
  return map[k] ?? null
}

function lineItemIdForPayload(
  li: LineItemForKpiFanout,
  mbaNumber: string,
  mediaType: string,
  indexInFullArray: number,
): string {
  const code = idCodeForKpiMediaType(mediaType)
  if (code) {
    return buildLineItemIdentity(li, mbaNumber, code, indexInFullArray).line_item_id
  }
  if (norm(mediaType) === "production") {
    const fallback = `${mbaNumber}PROD${indexInFullArray + 1}`
    return String(li.line_item_id ?? li.lineItemId ?? fallback).trim()
  }
  return String(li.line_item_id ?? li.lineItemId ?? "").trim()
}

export function fanOutKpiPayload(
  kpiRows: ResolvedKPIRow[],
  base: {
    mp_client_name: string
    mba_number: string
    version_number: number
    campaign_name: string
  },
  lineItemsByMediaType: Record<string, LineItemForKpiFanout[]>,
): CampaignKPI[] {
  return kpiRows.flatMap((row) => {
    const targetId = String(row.lineItemId ?? "").trim()
    if (!targetId) {
      console.warn("[campaign_kpi] Skipping KPI row: missing lineItemId", {
        media_type: row.media_type,
        publisher: row.publisher,
        bid_strategy: row.bid_strategy,
      })
      return []
    }

    const items =
      lineItemsByMediaType[row.media_type] ??
      lineItemsByMediaType[row.media_type.toLowerCase()] ??
      []

    const primaryMatches: Array<{ li: LineItemForKpiFanout; indexInFullArray: number }> = []
    for (let indexInFullArray = 0; indexInFullArray < items.length; indexInFullArray++) {
      const li = items[indexInFullArray]
      const id = String(li.line_item_id ?? li.lineItemId ?? "").trim()
      if (id === targetId) {
        primaryMatches.push({ li, indexInFullArray })
      }
    }

    let match: { li: LineItemForKpiFanout; indexInFullArray: number } | null = null

    if (primaryMatches.length > 0) {
      if (primaryMatches.length > 1) {
        console.warn("[campaign_kpi] Multiple line items matched single lineItemId; using first", {
          media_type: row.media_type,
          lineItemId: targetId,
        })
      }
      match = primaryMatches[0]
    } else {
      const legacyMatches: Array<{ li: LineItemForKpiFanout; indexInFullArray: number }> = []
      for (let indexInFullArray = 0; indexInFullArray < items.length; indexInFullArray++) {
        const li = items[indexInFullArray]
        const recomputed = lineItemIdForPayload(li, base.mba_number, row.media_type, indexInFullArray)
        if (recomputed === targetId) {
          legacyMatches.push({ li, indexInFullArray })
        }
      }
      if (legacyMatches.length === 0) {
        console.warn("[campaign_kpi] No line item matched KPI row lineItemId", {
          media_type: row.media_type,
          lineItemId: targetId,
        })
        return []
      }
      if (legacyMatches.length > 1) {
        console.warn("[campaign_kpi] Multiple line items matched single lineItemId; using first", {
          media_type: row.media_type,
          lineItemId: targetId,
        })
      }
      match = legacyMatches[0]
    }

    const { li, indexInFullArray } = match
    const line_item_id = lineItemIdForPayload(li, base.mba_number, row.media_type, indexInFullArray)
    if (!line_item_id) {
      console.warn("[campaign_kpi] Skipping matched line item: empty line_item_id", {
        media_type: row.media_type,
        publisher: row.publisher,
        bid_strategy: row.bid_strategy,
      })
      return []
    }
    return [
      {
        ...base,
        media_type: row.media_type,
        publisher: row.publisher,
        bid_strategy: row.bid_strategy,
        line_item_id,
        ctr: row.ctr,
        cpv: row.cpv,
        conversion_rate: row.conversion_rate,
        vtr: row.vtr,
        frequency: row.frequency,
      },
    ]
  })
}
