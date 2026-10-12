/**
 * Turns a version's `mba_fee_snapshots.fees` object into a fee percent
 * for every editor channel, plus the four direct-digital estimate keys.
 * The JSON is the client fee loading
 * (`feedigidisplay`, `feedigivideo`, `feedigiaudio`, `feebvod`, and the
 * other client fee fields). A missing field on a present row is 0%.
 */

import { resolveFeePctFromFeeLoading } from "@/lib/finance/computeCampaignFinancials"
import type { ClientFeeField, FeeLoading } from "@/lib/finance/campaignFinancials.types"
import {
  type ChannelFeePcts,
  type FeePctsByVersionId,
} from "@/lib/delivery/directDigitalFeeLookup"

const SCHEDULE_MEDIA_TYPES = [
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "digiDisplay",
  "digiAudio",
  "digiVideo",
  "bvod",
  "integration",
  "search",
  "socialMedia",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
  "influencers",
  "production",
] as const

const CLIENT_FEE_FIELDS = new Set<string>([
  "feetelevision",
  "feeradio",
  "feenewspapers",
  "feemagazines",
  "feeooh",
  "feecinema",
  "feedigidisplay",
  "feedigiaudio",
  "feedigivideo",
  "feebvod",
  "feeintegration",
  "feesearch",
  "feesocial",
  "feeprogdisplay",
  "feeprogvideo",
  "feeprogbvod",
  "feeprogaudio",
  "feeprogooh",
  "feecontentcreator",
  "feeinfluencers",
])

export function feeLoadingFromSnapshot(fees: unknown): FeeLoading | null {
  if (!fees || typeof fees !== "object" || Array.isArray(fees)) return null
  const out: FeeLoading = {}
  for (const [key, value] of Object.entries(fees as Record<string, unknown>)) {
    if (!CLIENT_FEE_FIELDS.has(key)) continue
    const n =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : NaN
    if (!Number.isFinite(n)) continue
    out[key as ClientFeeField] = n
  }
  return out
}

export function feeChannelsFromLoading(fees: FeeLoading): ChannelFeePcts {
  const channels: Record<string, number> = {
    "digital-display": resolveFeePctFromFeeLoading("digitaldisplay", fees),
    "digital-video": resolveFeePctFromFeeLoading("digitalvideo", fees),
    "digital-audio": resolveFeePctFromFeeLoading("digitalaudio", fees),
    bvod: resolveFeePctFromFeeLoading("bvod", fees),
  }
  for (const mediaType of SCHEDULE_MEDIA_TYPES) {
    channels[mediaType] = resolveFeePctFromFeeLoading(mediaType, fees)
  }
  return channels as ChannelFeePcts
}

/**
 * Snapshot row wins. Client fee loading is used only when the caller
 * already has that row and the version has no snapshot. Otherwise the
 * version is omitted and the estimate keeps the gross budget.
 */
export function feePctsByVersionFromSnapshots(args: {
  versionIds: readonly number[]
  snapshots: ReadonlyMap<number, FeeLoading>
  clientFeeLoading?: FeeLoading | null
}): FeePctsByVersionId {
  const out: FeePctsByVersionId = {}
  for (const versionId of args.versionIds) {
    const snapshot = args.snapshots.get(versionId)
    if (snapshot) {
      out[String(versionId)] = feeChannelsFromLoading(snapshot)
      continue
    }
    if (args.clientFeeLoading) {
      out[String(versionId)] = feeChannelsFromLoading(args.clientFeeLoading)
    }
  }
  return out
}
