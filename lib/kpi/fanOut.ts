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
    const items =
      lineItemsByMediaType[row.media_type] ??
      lineItemsByMediaType[row.media_type.toLowerCase()] ??
      []
    const matches = items
      .map((li, indexInFullArray) => ({ li, indexInFullArray }))
      .filter(
        ({ li }) =>
          norm(li.platform) === norm(row.publisher) &&
          norm(li.bid_strategy ?? li.bidStrategy) === norm(row.bid_strategy),
      )
    if (matches.length === 0) {
      console.warn("[campaign_kpi] No line items matched KPI row", {
        media_type: row.media_type,
        publisher: row.publisher,
        bid_strategy: row.bid_strategy,
      })
    }
    return matches.flatMap(({ li, indexInFullArray }) => {
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
  })
}
