import {
  deliverySourceLookupKey,
  lookupActiveDeliverySource,
} from "@/lib/delivery/deliverySourceMap"

const OFFLINE_SOURCE_TABLES = new Set([
  "media_plan_television",
  "media_plan_radio",
  "media_plan_newspaper",
  "media_plan_magazines",
  "media_plan_ooh",
  "media_plan_cinema",
])

const DIGITAL_SOURCE_TABLES = new Set([
  "media_plan_digi_display",
  "media_plan_digi_video",
  "media_plan_digi_audio",
  "media_plan_digi_bvod",
  "media_plan_prog_display",
  "media_plan_prog_video",
  "media_plan_prog_audio",
  "media_plan_prog_bvod",
  "media_plan_prog_ooh",
])

function isValueAddBuyType(buyType: string | null | undefined): boolean {
  const bt = String(buyType ?? "").trim().toLowerCase()
  return bt === "bonus" || bt === "package_inclusions"
}

export type AssumeSpendLine = {
  buyType: string | null
  sourceTable: string
  noAdserving: boolean
  publisher: string | null
  platform: string | null
  deliveryMediaCents: number
}

/** Impressions, clicks, or spend above 0. Results and views alone are not presence. */
export function hasPositiveDelivery(metrics: {
  impressions?: number | null
  clicks?: number | null
  spend?: number | null
}): boolean {
  const positive = (value: number | null | undefined) =>
    typeof value === "number" && Number.isFinite(value) && value > 0
  return positive(metrics.impressions) || positive(metrics.clicks) || positive(metrics.spend)
}

/**
 * True when the snapshot rule says assume.
 * Snowflake fact rows are not visible here. The warehouse procedure deletes
 * assumed_spend rows when a line gains pacing, search, or social facts.
 */
export function assumeSpendForSnapshotLine(args: AssumeSpendLine): boolean {
  if (isValueAddBuyType(args.buyType)) return false
  if (!(args.deliveryMediaCents > 0)) return false
  if (OFFLINE_SOURCE_TABLES.has(args.sourceTable)) return true
  if (!DIGITAL_SOURCE_TABLES.has(args.sourceTable)) return false
  if (!args.noAdserving) return false
  const key = deliverySourceLookupKey(args.publisher, args.platform)
  return lookupActiveDeliverySource(key) == null
}

/**
 * App pacing. The snapshot rule, and no delivery row through the as-of date.
 * `deliveryPresence` is impressions, clicks, or spend already loaded by the caller.
 */
export function isAssumedSpendLine(line: AssumeSpendLine, deliveryPresence: boolean): boolean {
  if (deliveryPresence) return false
  return assumeSpendForSnapshotLine(line)
}
