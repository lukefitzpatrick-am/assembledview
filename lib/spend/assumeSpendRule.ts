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

/**
 * True when the line should be paced as assumed spend.
 * Snowflake fact rows are not visible here. A later procedure deletes
 * assumed_spend rows when a digital line gains facts.
 */
export function assumeSpendForSnapshotLine(args: {
  buyType: string | null
  sourceTable: string
  noAdserving: boolean
  publisher: string | null
  platform: string | null
  deliveryMediaCents: number
}): boolean {
  if (isValueAddBuyType(args.buyType)) return false
  if (!(args.deliveryMediaCents > 0)) return false
  if (OFFLINE_SOURCE_TABLES.has(args.sourceTable)) return true
  if (!DIGITAL_SOURCE_TABLES.has(args.sourceTable)) return false
  if (!args.noAdserving) return false
  const key = deliverySourceLookupKey(args.publisher, args.platform)
  return lookupActiveDeliverySource(key) == null
}
