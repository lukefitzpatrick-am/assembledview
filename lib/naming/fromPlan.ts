import { slugify } from "./compose"
import { TEMPLATES } from "./templates"
import type { NamingTemplate } from "./types"

/** MBA `lineItems` channel key → naming platform. */
export type NamingPlatform =
  | "cm360"
  | "dv360"
  | "youtube"
  | "meta"
  | "search"
  | "native"

export type ChannelKey =
  | "progDisplay"
  | "progVideo"
  | "progBvod"
  | "progAudio"
  | "progOoh"
  | "digitalDisplay"
  | "digitalAudio"
  | "digitalVideo"
  | "bvod"
  | "integration"
  | "socialMedia"
  | "search"

export type PlatformTab = {
  platform: NamingPlatform
  label: string
  /** Human subtitle: "Prog Display → DV360 naming" */
  mappingLabels: string[]
  channelKeys: string[]
}

export type PlanGlobals = {
  brand: string
  client: string
  campaign: string
  mba: string
  month_start: string
  campaign_start_date: string
}

export type BaseLineRow = {
  channelKey: string
  channelLabel: string
  publisher: string
  media_type: string
  line_item_id: string
  buy_type: string
  targeting: string
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const

const CHANNEL_LABELS: Record<string, string> = {
  progDisplay: "Prog Display",
  progVideo: "Prog Video",
  progBvod: "Prog BVOD",
  progAudio: "Prog Audio",
  progOoh: "Prog OOH",
  digitalDisplay: "Digital Display",
  digitalAudio: "Digital Audio",
  digitalVideo: "Digital Video",
  bvod: "BVOD",
  integration: "Integration",
  socialMedia: "Social",
  search: "Search",
}

const CHANNEL_MEDIA_TYPE: Record<string, string> = {
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

const PROG_CHANNELS = [
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
] as const

const CM360_CHANNELS = [
  "digitalDisplay",
  "digitalAudio",
  "digitalVideo",
  "bvod",
  "integration",
] as const

const CONTAINER_KEY_BY_CHANNEL: Record<string, string> = {
  search: "search",
  socialMedia: "socialmedia",
  digitalAudio: "digiaudio",
  digitalDisplay: "digidisplay",
  digitalVideo: "digivideo",
  bvod: "bvod",
  integration: "integration",
  progDisplay: "progdisplay",
  progVideo: "progvideo",
  progBvod: "progbvod",
  progAudio: "progaudio",
  progOoh: "progooh",
}

export function containerKeyForChannel(channelKey: string): string | undefined {
  return CONTAINER_KEY_BY_CHANNEL[channelKey]
}

export function channelLabel(channelKey: string): string {
  return CHANNEL_LABELS[channelKey] ?? channelKey
}

/** DEFAULT(Q10): mmmyy from campaign start date (date-only safe). */
export function monthStartFromDate(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim()
  if (!s) return ""
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const monthIdx = Number(m[2]) - 1
    const yy = m[1].slice(2)
    if (monthIdx >= 0 && monthIdx < 12) return `${MONTHS[monthIdx]}${yy}`
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ""
  return `${MONTHS[d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(2)}`
}

function resolveLineItemId(item: Record<string, unknown>): string {
  for (const key of ["line_item_id", "lineItemId", "LINE_ITEM_ID", "id"]) {
    const v = item[key]
    if (v === undefined || v === null) continue
    const id = String(v).trim()
    if (id) return id
  }
  return ""
}

function resolvePublisher(item: Record<string, unknown>): string {
  for (const key of ["publisher", "platform", "site", "network"]) {
    const v = item[key]
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ""
}

function resolveBuyType(item: Record<string, unknown>): string {
  for (const key of ["buyType", "buy_type", "BuyType"]) {
    const v = item[key]
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ""
}

function resolveTargeting(item: Record<string, unknown>): string {
  for (const key of ["targetingAttribute", "creativeTargeting", "targeting"]) {
    const v = item[key]
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ""
}

function looksLikeYoutube(item: Record<string, unknown>): boolean {
  const hay = [item.publisher, item.platform, item.site, item.network]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ")
  return hay.includes("youtube") || hay.includes("yt ")
}

function looksLikeNative(item: Record<string, unknown>): boolean {
  const hay = [item.publisher, item.platform, item.site, item.network]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ")
  return hay.includes("taboola") || hay.includes("native") || hay.includes("outbrain")
}

function activeChannelKeys(lineItems: Record<string, unknown[]> | null | undefined): string[] {
  if (!lineItems) return []
  return Object.entries(lineItems)
    .filter(([, items]) => Array.isArray(items) && items.length > 0)
    .map(([key]) => key)
}

function flattenChannelRows(
  lineItems: Record<string, unknown[]> | null | undefined,
  channelKeys: readonly string[],
  predicate?: (item: Record<string, unknown>, channelKey: string) => boolean,
): BaseLineRow[] {
  if (!lineItems) return []
  const rows: BaseLineRow[] = []
  for (const channelKey of channelKeys) {
    const items = lineItems[channelKey]
    if (!Array.isArray(items)) continue
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue
      const item = raw as Record<string, unknown>
      if (predicate && !predicate(item, channelKey)) continue
      const line_item_id = resolveLineItemId(item)
      if (!line_item_id) continue
      rows.push({
        channelKey,
        channelLabel: channelLabel(channelKey),
        publisher: resolvePublisher(item),
        media_type: CHANNEL_MEDIA_TYPE[channelKey] ?? channelKey,
        line_item_id,
        buy_type: resolveBuyType(item),
        targeting: resolveTargeting(item),
      })
    }
  }
  return rows
}

/**
 * Derive which naming-platform tabs to show from the plan's populated channels.
 */
export function derivePlatformTabs(
  lineItems: Record<string, unknown[]> | null | undefined,
): PlatformTab[] {
  const active = new Set(activeChannelKeys(lineItems))
  const tabs: PlatformTab[] = []

  const progActive = PROG_CHANNELS.filter((k) => active.has(k))
  if (progActive.length > 0) {
    tabs.push({
      platform: "dv360",
      label: "DV360",
      channelKeys: [...progActive],
      mappingLabels: progActive.map((k) => `${channelLabel(k)} → DV360 naming`),
    })
  }

  const hasYoutubeChannel =
    active.has("digitalVideo") ||
    active.has("progVideo") ||
    flattenChannelRows(lineItems, [...CM360_CHANNELS, ...PROG_CHANNELS], looksLikeYoutube)
      .length > 0

  const cm360Active = CM360_CHANNELS.filter((k) => active.has(k))
  // Prefer non-YouTube digital rows for CM360 when a YouTube tab will also show
  if (cm360Active.length > 0) {
    tabs.push({
      platform: "cm360",
      label: "CM360",
      channelKeys: [...cm360Active],
      mappingLabels: cm360Active.map((k) => `${channelLabel(k)} → CM360 naming`),
    })
  }

  if (hasYoutubeChannel) {
    const ytChannels = ["digitalVideo", "progVideo"].filter((k) => active.has(k))
    tabs.push({
      platform: "youtube",
      label: "YouTube",
      channelKeys: ytChannels.length > 0 ? ytChannels : ["digitalVideo"],
      mappingLabels: (ytChannels.length > 0 ? ytChannels : ["digitalVideo"]).map(
        (k) => `${channelLabel(k)} → YouTube naming`,
      ),
    })
  }

  if (active.has("socialMedia")) {
    tabs.push({
      platform: "meta",
      label: "Meta",
      channelKeys: ["socialMedia"],
      mappingLabels: ["Social → Meta naming"],
    })
  }

  if (active.has("search")) {
    tabs.push({
      platform: "search",
      label: "Search",
      channelKeys: ["search"],
      mappingLabels: ["Search → Search naming"],
    })
  }

  const nativeRows = flattenChannelRows(lineItems, [...CM360_CHANNELS, "search"], looksLikeNative)
  if (nativeRows.length > 0) {
    const keys = [...new Set(nativeRows.map((r) => r.channelKey))]
    tabs.push({
      platform: "native",
      label: "Native",
      channelKeys: keys,
      mappingLabels: keys.map((k) => `${channelLabel(k)} → Native naming`),
    })
  }

  return tabs
}

export function baseRowsForPlatform(
  platform: NamingPlatform,
  lineItems: Record<string, unknown[]> | null | undefined,
  tab: PlatformTab,
): BaseLineRow[] {
  switch (platform) {
    case "dv360":
      return flattenChannelRows(lineItems, tab.channelKeys)
    case "cm360":
      return flattenChannelRows(lineItems, tab.channelKeys, (item) => !looksLikeYoutube(item) && !looksLikeNative(item))
    case "youtube": {
      const yt = flattenChannelRows(lineItems, tab.channelKeys, looksLikeYoutube)
      if (yt.length > 0) return yt
      return flattenChannelRows(lineItems, tab.channelKeys)
    }
    case "meta":
      return flattenChannelRows(lineItems, ["socialMedia"])
    case "search":
      return flattenChannelRows(lineItems, ["search"])
    case "native":
      return flattenChannelRows(lineItems, tab.channelKeys, looksLikeNative)
    default:
      return []
  }
}

/**
 * Defensively slugify posted / form globals before compose.
 * Idempotent: already-slugified values pass through unchanged.
 * Preserves month_start + campaign_start_date (not name tokens).
 */
export function slugifyPlanGlobals(globals: PlanGlobals): PlanGlobals {
  const mba =
    slugify(globals.mba) || String(globals.mba ?? "").trim().toLowerCase()
  const brand = slugify(globals.brand)
  const client = slugify(globals.client)
  const campaign = slugify(globals.campaign)
  return {
    brand: brand || client || mba,
    client: client || brand || mba,
    campaign: campaign || mba,
    mba,
    month_start: String(globals.month_start ?? "").trim().toLowerCase(),
    campaign_start_date: String(globals.campaign_start_date ?? "").trim(),
  }
}

export function extractPlanGlobals(
  plan: Record<string, unknown>,
  mbaNumber: string,
): PlanGlobals {
  const clientRaw = String(
    plan.mp_client_name || plan.client_name || plan.mp_clientname || "",
  ).trim()
  const brandRaw = String(plan.mp_brand || plan.brand || clientRaw || "").trim()
  const campaignRaw = String(
    plan.mp_campaignname || plan.campaign_name || mbaNumber,
  ).trim()
  const startRaw = String(
    plan.campaign_start_date ||
      plan.mp_campaigndates_start ||
      plan.start_date ||
      "",
  ).trim()

  return slugifyPlanGlobals({
    brand: brandRaw || clientRaw,
    client: clientRaw || brandRaw,
    campaign: campaignRaw || mbaNumber,
    mba: mbaNumber,
    month_start: monthStartFromDate(startRaw),
    campaign_start_date: startRaw,
  })
}

export function templatesForPlatform(platform: string): NamingTemplate[] {
  return TEMPLATES.filter((t) => t.platform === platform)
}

/** Levels that are seeded one-row-per-line-item (have publisher or line_item_id). */
export function levelNeedsLineItemSeed(template: NamingTemplate): boolean {
  return template.elements.some(
    (el) =>
      el.key === "line_item_id" ||
      el.key === "publisher" ||
      el.key === "media_type" ||
      el.key === "targeting",
  )
}
