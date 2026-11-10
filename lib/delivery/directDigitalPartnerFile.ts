/**
 * Channel Factory Direct Booked Digital Video lines (HF1, B32).
 *
 * A Digital Video line booked with Channel Factory (`delivery_source_map`
 * `partner_file`, publisher key `channel factory`) reads its own partner-file
 * rows (PACING_FACT 'Programmatic - Video', app channel `programmatic-video`)
 * as well as CM360 `ad-serving` rows. Every other container and publisher
 * reads CM360 rows only. The client dashboard section
 * (`buildDirectDigitalChannelSection`) and the pacing ad-serving composer
 * (`fetchAdServingPacingCampaignRows`) both use this one test.
 */

import { deliverySourceLookupKey, lookupActiveDeliverySource } from "@/lib/delivery/deliverySourceMap"

/** App channel of a Channel Factory row (`VW_PACING_PARTNER_FILE` emits 'Programmatic - Video'). */
export const PARTNER_FILE_VIDEO_CHANNEL = "programmatic-video"

/** The one Direct Booked Digital container whose lines may read partner-file rows. */
const PARTNER_FILE_DIRECT_DIGITAL_KEY = "digital-video"

function cleanId(v: unknown): string | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
  if (!s || s === "undefined" || s === "null") return null
  return s
}

/** True when a line in this Direct Booked Digital container is a Channel Factory partner-file line. */
export function isDirectDigitalPartnerFileLine(
  key: string,
  publisher: unknown,
  platform: unknown,
): boolean {
  if (key !== PARTNER_FILE_DIRECT_DIGITAL_KEY) return false
  const row = lookupActiveDeliverySource(deliverySourceLookupKey(publisher, platform))
  return row?.delivery_source === "partner_file" && row.publisher_key === "channel factory"
}

/**
 * HF1: lowercased ids of the Channel Factory partner-file lines in a Direct
 * Booked Digital container. Empty for every container but `digital-video`.
 */
export function directDigitalPartnerFileLineIds(
  key: string,
  items: ReadonlyArray<{ line_item_id?: string; publisher?: unknown; platform?: unknown }>,
): Set<string> {
  const ids = new Set<string>()
  if (key !== PARTNER_FILE_DIRECT_DIGITAL_KEY) return ids
  for (const item of items) {
    const id = cleanId(item.line_item_id)
    if (!id) continue
    if (isDirectDigitalPartnerFileLine(key, item.publisher, item.platform)) ids.add(id)
  }
  return ids
}
