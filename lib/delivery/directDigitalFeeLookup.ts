/**
 * Channel fee percents for a direct-digital estimate, already resolved
 * from `mba_fee_snapshots.fees` (or an already-loaded client fee loading).
 * A missing version key means there was no snapshot and no client fallback.
 */

import { normaliseScheduleMediaType } from "@/lib/finance/computeCampaignFinancials"

export type DirectDigitalFeeChannelKey =
  | "digital-display"
  | "digital-video"
  | "digital-audio"
  | "bvod"

export type DirectDigitalFeeChannels = Record<DirectDigitalFeeChannelKey, number>

/** Direct-digital estimate keys, plus every schedule media type from `resolveFeePctFromFeeLoading`. */
export type ChannelFeePcts = DirectDigitalFeeChannels & Record<string, number>

export type FeePctsByVersionId = Record<string, ChannelFeePcts>

/** Reads `mba_fee_snapshots` for the version ids already in hand. */
export type DirectDigitalFeePctsLoader = (args: {
  versionIds: readonly number[]
}) => Promise<FeePctsByVersionId>

const ESTIMATE_GROUP_TO_CHANNEL: Record<string, DirectDigitalFeeChannelKey> = {
  digital_display: "digital-display",
  digital_video: "digital-video",
  digital_audio: "digital-audio",
  bvod: "bvod",
}

const AD_SERVING_FAMILY_TO_CHANNEL: Record<string, DirectDigitalFeeChannelKey> = {
  digitalDisplay: "digital-display",
  digitalVideo: "digital-video",
  digitalAudio: "digital-audio",
  bvod: "bvod",
}

export function positiveVersionId(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

export function versionIdFromLine(item: unknown): number | null {
  if (!item || typeof item !== "object") return null
  const rec = item as Record<string, unknown>
  return positiveVersionId(rec.media_plan_version ?? rec.mediaPlanVersionId)
}

export function channelKeyForEstimateGroup(group: string): DirectDigitalFeeChannelKey | null {
  return ESTIMATE_GROUP_TO_CHANNEL[group] ?? null
}

export function channelKeyForAdServingFamily(family: string): DirectDigitalFeeChannelKey | null {
  return AD_SERVING_FAMILY_TO_CHANNEL[family] ?? null
}

export function feePctFromVersionMap(
  map: FeePctsByVersionId | undefined,
  versionId: number | null,
  channel: DirectDigitalFeeChannelKey | null,
): number | null {
  if (versionId == null || channel == null || !map) return null
  const row = map[String(versionId)]
  if (!row) return null
  const pct = row[channel]
  return typeof pct === "number" && Number.isFinite(pct) ? pct : null
}

/** Fee percent for any editor channel. Missing snapshot or unknown type is 0 (gross stays gross). */
export function feePctForScheduleMedia(
  map: FeePctsByVersionId | undefined,
  versionId: number | null,
  mediaType: string,
): number {
  if (versionId == null || !map) return 0
  const row = map[String(versionId)]
  if (!row) return 0
  const key = normaliseScheduleMediaType(mediaType)
  if (!key) return 0
  const pct = row[key]
  return typeof pct === "number" && Number.isFinite(pct) ? pct : 0
}
