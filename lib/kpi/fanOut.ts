import {
  buildLineItemIdentity,
  MEDIA_TYPE_ID_CODES,
  parseLineNumberFromLineItemId,
} from "@/lib/mediaplan/lineItemIds"
import { extractKPIKeys } from "./matching"
import type { CampaignKPI, LineItemForKpiFanout, ResolvedKPIRow } from "./types"

export type { LineItemForKpiFanout }

function norm(s: string | undefined | null) {
  return String(s ?? "").trim().toLowerCase()
}

/** Resolver / workbook keys → alternate keys used in `lineItemsByMediaType` maps. */
const FANOUT_LINE_ITEM_MAP_ALIASES: Record<string, string[]> = {
  digidisplay: ["digiDisplay", "digitalDisplay"],
  digitaldisplay: ["digiDisplay", "digitalDisplay"],
  digiaudio: ["digiAudio", "digitalAudio"],
  digitalaudio: ["digiAudio", "digitalAudio"],
  digivideo: ["digiVideo", "digitalVideo"],
  digitalvideo: ["digiVideo", "digitalVideo"],
  socialmedia: ["socialMedia"],
  progdisplay: ["progDisplay"],
  progvideo: ["progVideo"],
  progbvod: ["progBvod", "progBVOD"],
  progaudio: ["progAudio"],
  progooh: ["progOoh", "progOOH"],
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

export function lookupLineItemsForKpiFanOut(
  lineItemsByMediaType: Record<string, LineItemForKpiFanout[]>,
  mediaType: string,
): LineItemForKpiFanout[] {
  const keysToTry = new Set<string>([
    mediaType,
    mediaType.toLowerCase(),
    norm(mediaType),
  ])
  const aliases = FANOUT_LINE_ITEM_MAP_ALIASES[norm(mediaType)]
  if (aliases) {
    for (const alias of aliases) keysToTry.add(alias)
  }

  for (const key of keysToTry) {
    const items = lineItemsByMediaType[key]
    if (items?.length) return items
  }
  return []
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

function mediaCodeInId(lineItemId: string, mediaType: string): boolean {
  const code = idCodeForKpiMediaType(mediaType)
  if (!code) return true
  return lineItemId.toUpperCase().includes(code)
}

/** Match KPI row id to a line item by exact id, recomputed id, or line number + media code. */
function lineItemMatchesKpiTarget(
  li: LineItemForKpiFanout,
  targetId: string,
  mbaNumber: string,
  mediaType: string,
  indexInFullArray: number,
): boolean {
  const stored = String(li.line_item_id ?? li.lineItemId ?? "").trim()
  if (stored && stored === targetId) return true

  const recomputed = lineItemIdForPayload(li, mbaNumber, mediaType, indexInFullArray)
  if (recomputed && recomputed === targetId) return true

  const targetNum = parseLineNumberFromLineItemId(targetId)
  const storedNum = stored ? parseLineNumberFromLineItemId(stored) : null
  const recomputedNum = parseLineNumberFromLineItemId(recomputed)
  if (targetNum == null) return false

  if (storedNum != null && storedNum === targetNum && mediaCodeInId(stored, mediaType)) {
    return true
  }
  if (
    recomputedNum != null &&
    recomputedNum === targetNum &&
    mediaCodeInId(recomputed, mediaType)
  ) {
    return true
  }

  return false
}

function ensurePublisherAndBidStrategy(
  row: ResolvedKPIRow,
  li: LineItemForKpiFanout,
  mediaType: string,
): { publisher: string; bid_strategy: string } {
  const keys = extractKPIKeys(li as Parameters<typeof extractKPIKeys>[0], mediaType)
  const publisher = (row.publisher?.trim() || keys.publisher || "unknown").trim() || "unknown"
  const bid_strategy =
    (row.bid_strategy?.trim() || keys.bidStrategy || "fixed_cost").trim() || "fixed_cost"
  return { publisher, bid_strategy }
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

    const items = lookupLineItemsForKpiFanOut(lineItemsByMediaType, row.media_type)

    const matches: Array<{ li: LineItemForKpiFanout; indexInFullArray: number }> = []
    for (let indexInFullArray = 0; indexInFullArray < items.length; indexInFullArray++) {
      const li = items[indexInFullArray]
      if (lineItemMatchesKpiTarget(li, targetId, base.mba_number, row.media_type, indexInFullArray)) {
        matches.push({ li, indexInFullArray })
      }
    }

    if (matches.length === 0) {
      console.warn("[campaign_kpi] No line item matched KPI row lineItemId", {
        media_type: row.media_type,
        lineItemId: targetId,
        lineItemCount: items.length,
      })
      return []
    }

    if (matches.length > 1) {
      console.warn("[campaign_kpi] Multiple line items matched single lineItemId; using first", {
        media_type: row.media_type,
        lineItemId: targetId,
      })
    }

    const { li, indexInFullArray } = matches[0]
    const line_item_id = lineItemIdForPayload(li, base.mba_number, row.media_type, indexInFullArray)
    if (!line_item_id) {
      console.warn("[campaign_kpi] Skipping matched line item: empty line_item_id", {
        media_type: row.media_type,
        publisher: row.publisher,
        bid_strategy: row.bid_strategy,
      })
      return []
    }

    const { publisher, bid_strategy } = ensurePublisherAndBidStrategy(row, li, row.media_type)

    return [
      {
        ...base,
        media_type: row.media_type,
        publisher,
        bid_strategy,
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
