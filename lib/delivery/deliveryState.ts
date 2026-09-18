import {
  deliverySourceLookupKey,
  lookupActiveDeliverySource,
  type DeliverySourceMapRow,
} from "@/lib/delivery/deliverySourceMap"

export type DeliveryState = "reported" | "no_rows_yet" | "no_source"

/** Real delivery activity — not modelled spend and not a zero-metric pacing stub. */
export function hasDeliveryFactActivity(metrics: {
  impressions?: number
  clicks?: number
  results?: number
  video3sViews?: number
}): boolean {
  return (
    (metrics.impressions ?? 0) > 0 ||
    (metrics.clicks ?? 0) > 0 ||
    (metrics.results ?? 0) > 0 ||
    (metrics.video3sViews ?? 0) > 0
  )
}

/** Snapshot line reporting state for campaign-read / AVA delivery tools. */
export function resolveDeliveryState(input: {
  hasFactRows: boolean
  hasSource: boolean
}): DeliveryState {
  if (input.hasFactRows) return "reported"
  if (input.hasSource) return "no_rows_yet"
  return "no_source"
}

const CONNECTED_GROUPS = new Set([
  "search",
  "social_meta",
  "social_tiktok",
  "social_reddit",
])

/**
 * Same source rules as channel coverage: search and classified social are
 * connected; plan_only is not; programmatic / direct digital look up the map.
 */
export function lineHasDeliverySource(input: {
  group: string
  publisher?: unknown
  platform?: unknown
  sourceMap?: readonly DeliverySourceMapRow[]
}): boolean {
  if (CONNECTED_GROUPS.has(input.group)) return true
  if (input.group === "plan_only") return false
  const key = deliverySourceLookupKey(input.publisher, input.platform)
  return Boolean(lookupActiveDeliverySource(key, input.sourceMap))
}
