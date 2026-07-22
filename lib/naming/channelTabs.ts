import { slugify } from "./compose"
import {
  channelLabel,
  containerKeyForChannel,
  looksLikeNative,
  looksLikeYoutube,
  type ChannelKey,
} from "./fromPlan"

/** Naming family for channel tabs (rev-2 map + YouTube/Native overlays). */
export type ChannelFamily =
  | "cm360"
  | "dv360"
  | "search"
  | "meta"
  | "youtube"
  | "native"

export type ChannelTab = {
  channelKey: string
  label: string
  family: ChannelFamily
  containerKey: string
}

export type ChannelDetailRow = {
  line_item_id: string
  channelKey: string
  tab_label: string
  family: ChannelFamily
  publisher: string
  media_type: string
  buy_type: string
  targeting_raw: string
  targeting_token: string
  geo_raw: string
  geo_token: string
  creative_name: string
  size?: string
}

export type TokenOverrides = Record<
  string,
  { targeting?: string; geo?: string }
>

export type ChannelRowsResult = {
  rows: ChannelDetailRow[]
  skipped: { reason: "missing_line_item_id"; count: number }
}

export type SkippedLineItemGroup = {
  channelKey: string
  publisher: string
  reason: "missing_line_item_id"
  count: number
}

/** Fixed order: digital → prog → search → social. */
const CHANNEL_TAB_ORDER: readonly ChannelKey[] = [
  "digitalDisplay",
  "digitalAudio",
  "digitalVideo",
  "bvod",
  "integration",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
  "search",
  "socialMedia",
] as const

const FAMILY_BY_CHANNEL: Record<ChannelKey, ChannelFamily> = {
  digitalDisplay: "cm360",
  digitalAudio: "cm360",
  digitalVideo: "cm360",
  bvod: "cm360",
  integration: "cm360",
  progDisplay: "dv360",
  progVideo: "dv360",
  progBvod: "dv360",
  progAudio: "dv360",
  progOoh: "dv360",
  search: "search",
  socialMedia: "meta",
}

const MEDIA_TYPE_BY_CHANNEL: Record<string, string> = {
  progDisplay: "display",
  progVideo: "video",
  progBvod: "bvod",
  progAudio: "audio",
  progOoh: "ooh",
  digitalDisplay: "display",
  digitalAudio: "audio",
  digitalVideo: "video",
  bvod: "bvod",
  integration: "integration",
  socialMedia: "social",
  search: "search",
}

const DIGITAL_CHANNELS = [
  "digitalDisplay",
  "digitalAudio",
  "digitalVideo",
  "bvod",
  "integration",
] as const

const YOUTUBE_SOURCE_CHANNELS = ["digitalVideo", "progVideo"] as const

const NATIVE_SOURCE_CHANNELS = [...DIGITAL_CHANNELS, "search"] as const

function firstNonEmpty(
  item: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const v = item[key]
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ""
}

function resolveLineItemId(item: Record<string, unknown>): string {
  return firstNonEmpty(item, ["line_item_id", "lineItemId", "LINE_ITEM_ID", "id"])
}

function resolvePublisher(item: Record<string, unknown>): string {
  return firstNonEmpty(item, ["publisher", "platform", "site", "network"])
}

function resolveBuyType(item: Record<string, unknown>): string {
  return firstNonEmpty(item, ["buyType", "buy_type", "BuyType"])
}

function resolveTargeting(item: Record<string, unknown>): string {
  return firstNonEmpty(item, [
    "targetingAttribute",
    "creativeTargeting",
    "targeting",
  ])
}

/** Geo: Meta `geo` picklist is absent on plan rows; `market` is the closest field. */
function resolveGeo(item: Record<string, unknown>): string {
  return firstNonEmpty(item, ["geo", "market", "Geo", "Market"])
}

function resolveCreativeName(item: Record<string, unknown>): string {
  return firstNonEmpty(item, [
    "creative_name",
    "creativeName",
    "creative",
    "Creative",
  ])
}

/** Size / creative-detail variants from legacy naming workbook + container fields. */
function resolveSize(item: Record<string, unknown>): string {
  return firstNonEmpty(item, [
    "size",
    "adSize",
    "ad_size",
    "duration",
    "digitalDuration",
    "radioDuration",
    "format",
  ])
}

function channelItems(
  lineItems: Record<string, unknown[]> | null | undefined,
  channelKey: string,
): Record<string, unknown>[] {
  if (!lineItems) return []
  const items = lineItems[channelKey]
  if (!Array.isArray(items)) return []
  const out: Record<string, unknown>[] = []
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue
    out.push(raw as Record<string, unknown>)
  }
  return out
}

function belongsToYoutubeTab(
  item: Record<string, unknown>,
  channelKey: string,
): boolean {
  return (
    (YOUTUBE_SOURCE_CHANNELS as readonly string[]).includes(channelKey) &&
    looksLikeYoutube(item)
  )
}

function belongsToNativeTab(
  item: Record<string, unknown>,
  channelKey: string,
): boolean {
  return (
    (NATIVE_SOURCE_CHANNELS as readonly string[]).includes(channelKey) &&
    looksLikeNative(item)
  )
}

function hasMatchingItems(
  lineItems: Record<string, unknown[]> | null | undefined,
  channelKeys: readonly string[],
  predicate: (item: Record<string, unknown>, channelKey: string) => boolean,
): boolean {
  for (const channelKey of channelKeys) {
    for (const item of channelItems(lineItems, channelKey)) {
      if (predicate(item, channelKey)) return true
    }
  }
  return false
}

function buildDetailRow(opts: {
  item: Record<string, unknown>
  channelKey: string
  tab: ChannelTab
  tokenOverrides?: TokenOverrides
}): ChannelDetailRow {
  const { item, channelKey, tab, tokenOverrides } = opts
  const line_item_id = resolveLineItemId(item)
  const targeting_raw = resolveTargeting(item)
  const geo_raw = resolveGeo(item)
  const override = tokenOverrides?.[line_item_id]

  const targeting_token = slugify(
    override?.targeting !== undefined ? override.targeting : targeting_raw,
  )
  const geo_token = slugify(override?.geo !== undefined ? override.geo : geo_raw)
  const size = resolveSize(item)

  return {
    line_item_id,
    channelKey,
    tab_label: tab.label,
    family: tab.family,
    publisher: resolvePublisher(item),
    media_type: MEDIA_TYPE_BY_CHANNEL[channelKey] ?? channelKey,
    buy_type: resolveBuyType(item),
    targeting_raw,
    targeting_token,
    geo_raw,
    geo_token,
    creative_name: resolveCreativeName(item),
    size,
  }
}

/**
 * Line items on naming-relevant channels that lack line_item_id (cannot sync).
 * Grouped by channel + publisher for the Input-sheet skipped note.
 * Offline channels (TV/radio/etc.) are not included — they never get tabs.
 */
export function collectSkippedLineItems(
  lineItems: Record<string, unknown[]> | null | undefined,
): SkippedLineItemGroup[] {
  const counts = new Map<string, SkippedLineItemGroup>()

  for (const channelKey of CHANNEL_TAB_ORDER) {
    for (const item of channelItems(lineItems, channelKey)) {
      if (resolveLineItemId(item)) continue
      const publisher = resolvePublisher(item) || "(unknown)"
      const key = `${channelKey}::${publisher}`
      const existing = counts.get(key)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(key, {
          channelKey,
          publisher,
          reason: "missing_line_item_id",
          count: 1,
        })
      }
    }
  }

  return [...counts.values()]
}

/**
 * One tab per active channel (rev-2 family map), fixed digital→prog→search→social
 * order. Appends YouTube / Native overlay tabs when matching rows exist.
 */
export function deriveChannelTabs(
  lineItems: Record<string, unknown[]> | null | undefined,
): ChannelTab[] {
  const tabs: ChannelTab[] = []

  for (const channelKey of CHANNEL_TAB_ORDER) {
    const items = channelItems(lineItems, channelKey)
    if (items.length === 0) continue
    tabs.push({
      channelKey,
      label: channelLabel(channelKey),
      family: FAMILY_BY_CHANNEL[channelKey],
      containerKey: containerKeyForChannel(channelKey) ?? "",
    })
  }

  if (
    hasMatchingItems(lineItems, YOUTUBE_SOURCE_CHANNELS, (item, channelKey) =>
      belongsToYoutubeTab(item, channelKey),
    )
  ) {
    tabs.push({
      channelKey: "youtube",
      label: "YouTube",
      family: "youtube",
      containerKey: "",
    })
  }

  if (
    hasMatchingItems(lineItems, NATIVE_SOURCE_CHANNELS, (item, channelKey) =>
      belongsToNativeTab(item, channelKey),
    )
  ) {
    tabs.push({
      channelKey: "native",
      label: "Native",
      family: "native",
      containerKey: "",
    })
  }

  return tabs
}

/**
 * Rows for a channel tab. Standard tabs exclude YouTube/Native overlay rows.
 * Rows without line_item_id are omitted and counted in `skipped` (not silent).
 */
export function channelRows(
  tab: ChannelTab,
  lineItems: Record<string, unknown[]> | null | undefined,
  tokenOverrides?: TokenOverrides,
): ChannelRowsResult {
  const sourceKeys: readonly string[] =
    tab.family === "youtube"
      ? YOUTUBE_SOURCE_CHANNELS
      : tab.family === "native"
        ? NATIVE_SOURCE_CHANNELS
        : [tab.channelKey]

  const rows: ChannelDetailRow[] = []
  let skippedCount = 0

  for (const channelKey of sourceKeys) {
    for (const item of channelItems(lineItems, channelKey)) {
      if (tab.family === "youtube") {
        if (!belongsToYoutubeTab(item, channelKey)) continue
      } else if (tab.family === "native") {
        if (!belongsToNativeTab(item, channelKey)) continue
      } else {
        if (belongsToYoutubeTab(item, channelKey)) continue
        if (belongsToNativeTab(item, channelKey)) continue
      }

      const line_item_id = resolveLineItemId(item)
      if (!line_item_id) {
        skippedCount += 1
        continue
      }

      rows.push(
        buildDetailRow({ item, channelKey, tab, tokenOverrides }),
      )
    }
  }

  return {
    rows,
    skipped: { reason: "missing_line_item_id", count: skippedCount },
  }
}
