import type { BillingLineItem } from "@/lib/types/financeBilling"
import { getMediaTypeKeyFromTableName } from "@/lib/finance/utils"

/**
 * Tables on `media_plan_versions` (snake_case) that carry line-item rows.
 * Mirrors {@link getMediaTypeKeyFromTableName} keys used when resolving plan data.
 *
 * Receivable billing in this app is derived from `billingSchedule` + these arrays. The finance hub
 * hydrates them via {@link hydratePlanVersionsForBillingLineEnrichment} when the list endpoint omits
 * related rows. On Xano you can alternatively attach the same fields on `finance_billing_line_items`
 * (Finance / billing group, e.g. api:9v_k2NR8) using addons that join each line to its media plan
 * row and reference tables (`tv_stations`, `display_site`, `magazines_adsizes`, etc.); use these
 * property names so {@link pickBillingLineItemMediaDetailsFromApiPayload} and the UI formatter align.
 */
export const MEDIA_PLAN_VERSION_LINE_ITEM_TABLE_KEYS = [
  "television_line_items",
  "radio_line_items",
  "newspaper_line_items",
  "magazines_line_items",
  "ooh_line_items",
  "cinema_line_items",
  "digital_display_line_items",
  "media_plan_digi_display",
  "digital_audio_line_items",
  "digital_video_line_items",
  "bvod_line_items",
  "integration_line_items",
  "search_line_items",
  "social_media_line_items",
  "prog_display_line_items",
  "prog_video_line_items",
  "prog_bvod_line_items",
  "prog_audio_line_items",
  "prog_ooh_line_items",
  "influencers_line_items",
] as const

export type BillingLineItemMediaDetailKey =
  | "network"
  | "platform"
  | "placement"
  | "market"
  | "title"
  | "ad_size"
  | "site"
  | "station"
  | "format"
  | "bid_strategy"
  | "creative"

const MEDIA_DETAIL_KEYS: readonly BillingLineItemMediaDetailKey[] = [
  "network",
  "platform",
  "placement",
  "market",
  "title",
  "ad_size",
  "site",
  "station",
  "format",
  "bid_strategy",
  "creative",
] as const

export type LineItemMediaDetailSlice = Pick<BillingLineItem, BillingLineItemMediaDetailKey>

function emptySlice(): LineItemMediaDetailSlice {
  return {
    network: null,
    platform: null,
    placement: null,
    market: null,
    title: null,
    ad_size: null,
    site: null,
    station: null,
    format: null,
    bid_strategy: null,
    creative: null,
  }
}

function str(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null) continue
    const t = String(v).trim()
    if (t.length > 0) return t
  }
  return null
}

function nestedStr(obj: unknown, path: string[]): string | null {
  let cur: unknown = obj
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return null
    cur = (cur as Record<string, unknown>)[key]
  }
  return str(cur)
}

/**
 * Map a raw media-plan line row (plus optional joined objects from Xano) onto finance description fields.
 */
export function extractMediaDetailSliceFromPlanRow(raw: unknown): LineItemMediaDetailSlice {
  if (raw == null || typeof raw !== "object") return emptySlice()
  const r = raw as Record<string, unknown>

  return {
    network: str(r.network, r.network_name),
    platform: str(r.platform),
    placement: str(r.placement, r.placement_name, r.line_item_name, r.lineItemName),
    market: str(r.market, r.state, r.region, r.geo),
    title: str(
      r.title,
      r.publication_title,
      r.magazine_title,
      r.newspaper_title,
      nestedStr(r.magazines, ["title"]),
      nestedStr(r.magazines, ["name"]),
      nestedStr(r.newspapers, ["title"]),
      nestedStr(r.newspapers, ["name"]),
      nestedStr(r.magazine, ["title"]),
      nestedStr(r.newspaper, ["title"])
    ),
    ad_size: str(
      r.ad_size,
      r.adSize,
      r.size,
      r.insert_size,
      nestedStr(r.magazines_adsizes, ["name"]),
      nestedStr(r.magazines_adsizes, ["label"]),
      nestedStr(r.magazines_adsizes, ["size"]),
      nestedStr(r.newspaper_adsizes, ["name"]),
      nestedStr(r.newspaper_adsizes, ["label"]),
      nestedStr(r.newspaper_adsizes, ["size"])
    ),
    site: str(
      r.site,
      r.site_name,
      nestedStr(r.display_site, ["name"]),
      nestedStr(r.display_site, ["site"]),
      nestedStr(r.video_site, ["name"]),
      nestedStr(r.video_site, ["site"]),
      nestedStr(r.bvod_site, ["name"]),
      nestedStr(r.bvod_site, ["site"])
    ),
    station: str(
      r.station,
      r.station_name,
      nestedStr(r.radio_stations, ["name"]),
      nestedStr(r.radio_stations, ["station"]),
      nestedStr(r.radio_stations, ["call_sign"]),
      nestedStr(r.audio_site, ["name"]),
      nestedStr(r.audio_site, ["station"])
    ),
    format: str(r.format, r.ooh_format, r.format_name),
    bid_strategy: str(
      r.bid_strategy,
      r.bidStrategy,
      r.buying_system,
      r.buy_type,
      r.bidder,
      r.bidding_strategy
    ),
    creative: str(r.creative, r.ad_name, r.adName, r.creative_name),
  }
}

function tableKeyToCamelProperty(tableKey: string): string {
  return tableKey.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

function lineItemsArrayOnVersion(version: Record<string, unknown>, tableKey: string): unknown[] {
  const camel = tableKeyToCamelProperty(tableKey)
  const raw = version[tableKey] ?? version[camel]
  return Array.isArray(raw) ? raw : []
}

function stableLineItemIdFromRaw(raw: unknown): string | null {
  if (raw == null || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const v = o.line_item_id ?? o.lineItemId ?? o.line_itemId
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

export type PlanLineItemMediaDetailLookup = Map<string, LineItemMediaDetailSlice>

/**
 * For each line item on the version, map `mediaTypeKey + '\\0' + lineItemId` → media-detail fields.
 * Also stores the first occurrence under bare `lineItemId` when not yet taken (helps legacy IDs).
 */
export function buildPlanLineItemMediaDetailLookup(version: Record<string, unknown>): PlanLineItemMediaDetailLookup {
  const map: PlanLineItemMediaDetailLookup = new Map()

  for (const tableKey of MEDIA_PLAN_VERSION_LINE_ITEM_TABLE_KEYS) {
    const rows = lineItemsArrayOnVersion(version, tableKey)
    if (rows.length === 0) continue
    const mediaKey = getMediaTypeKeyFromTableName(tableKey)

    for (const row of rows) {
      const id = stableLineItemIdFromRaw(row)
      if (!id) continue
      const slice = extractMediaDetailSliceFromPlanRow(row)
      const composite = `${mediaKey}\0${id}`
      map.set(composite, slice)
      if (!map.has(id)) map.set(id, slice)
    }
  }

  return map
}

export function lookupMediaDetailSlice(
  lookup: PlanLineItemMediaDetailLookup,
  mediaTypeKey: string,
  planLineItemId: string | null | undefined
): LineItemMediaDetailSlice | undefined {
  const id = (planLineItemId ?? "").trim()
  if (!id) return undefined
  return lookup.get(`${mediaTypeKey}\0${id}`) ?? lookup.get(id)
}

export function compactMediaDetailSlice(slice: LineItemMediaDetailSlice): Partial<Pick<BillingLineItem, BillingLineItemMediaDetailKey>> {
  const out: Partial<Pick<BillingLineItem, BillingLineItemMediaDetailKey>> = {}
  for (const key of MEDIA_DETAIL_KEYS) {
    const v = slice[key]
    if (v != null && String(v).trim().length > 0) {
      out[key] = v
    }
  }
  return out
}

function apiKeyToCamel(k: string): string {
  return k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

/** Pull media-detail fields from a Xano / API line item object (snake or camel). */
export function pickBillingLineItemMediaDetailsFromApiPayload(
  raw: Record<string, unknown>
): Partial<Pick<BillingLineItem, BillingLineItemMediaDetailKey>> {
  const out: Partial<Pick<BillingLineItem, BillingLineItemMediaDetailKey>> = {}
  for (const key of MEDIA_DETAIL_KEYS) {
    const v = raw[key] ?? raw[apiKeyToCamel(key)]
    const t = str(v)
    if (t) out[key] = t
  }
  return out
}
