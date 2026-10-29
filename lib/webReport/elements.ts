import { z } from "zod"

import { SEARCH_ADS_METRICS, SEARCH_ADS_PLATFORMS } from "@/lib/webReport/searchAds"
import { SOCIAL_ADS_METRICS, SOCIAL_ADS_PLATFORMS } from "@/lib/webReport/socialAds"

/**
 * Element registry. Render is `WebReportElement` in
 * `components/dashboard/web/reportElements.tsx`, one component per id.
 */

export const WEB_ELEMENT_GROUPS = [
  "Headline",
  "Google Analytics 4",
  "Search Console",
  "Paid media",
] as const

export type WebElementGroup = (typeof WEB_ELEMENT_GROUPS)[number]

export const WEB_METRICS = [
  "users",
  "newUsers",
  "sessions",
  "engagementRate",
  "keyEvents",
  "pageViews",
  "clicks",
  "impressions",
  "ctr",
  "position",
  "avSpend",
] as const

export type WebMetric = (typeof WEB_METRICS)[number]

/** GA4 total_users summed across days. That sum is not a deduped user count. */
export const USERS_SUM_OF_DAILY_TOOLTIP = "Users (sum of daily)"

export const WEB_DISPLAYS = [
  "tiles",
  "spark",
  "bullet",
  "combo",
  "line",
  "area",
  "column",
  "calendar",
  "table",
  "bar",
  "donut",
  "treemap",
  "waterfall",
  "bubble",
  "histogram",
  "text",
] as const

export type WebDisplay = (typeof WEB_DISPLAYS)[number]

export type WebWidth = 12 | 6 | 4

const metricSchema = z.enum(WEB_METRICS)

const eventNameSchema = z.string().trim().min(1).max(80)

/** Tile title. Falls back to the metric or event name. */
const tileLabelSchema = z.string().trim().min(1).max(60)

const kpiTileSchema = z
  .object({
    kind: z.enum(["metric", "keyEvent", "eventSum", "savedKpi"]),
    metric: metricSchema.optional(),
    eventName: eventNameSchema.optional(),
    /** GA4 event names added together for an event sum tile. */
    eventNames: z.array(eventNameSchema).min(1).max(12).optional(),
    label: tileLabelSchema.optional(),
    /** A saved monthly KPI (web_kpis.id). Its targets come from the KPI, not from `target`. */
    kpiId: z.string().uuid().optional(),
    target: z.number().positive().optional(),
  })
  .superRefine((tile, ctx) => {
    if (tile.kind === "savedKpi" && !tile.kpiId) {
      ctx.addIssue({ code: "custom", message: "A saved KPI tile needs a KPI", path: ["kpiId"] })
    }
    if (tile.kind === "metric" && !tile.metric) {
      ctx.addIssue({ code: "custom", message: "A metric tile needs a metric", path: ["metric"] })
    }
    if (tile.kind === "keyEvent" && !tile.eventName) {
      ctx.addIssue({ code: "custom", message: "A key event tile needs an event name", path: ["eventName"] })
    }
    if (tile.kind === "eventSum" && (!tile.eventNames || tile.eventNames.length === 0)) {
      ctx.addIssue({ code: "custom", message: "An event sum tile needs at least one event", path: ["eventNames"] })
    }
  })

/** A snapshot tile that counts one GA4 event, or adds several together. */
const eventTileSchema = z.object({
  label: tileLabelSchema,
  eventNames: z.array(eventNameSchema).min(1).max(12),
})

/** Off when absent, so saved layouts render as they did. */
const compareSchema = z.boolean().optional()

export const elementSettings = {
  kpis: z.object({ tiles: z.array(kpiTileSchema).min(1).max(6), compare: compareSchema }),
  snapshot: z
    .object({
      tiles: z.array(metricSchema).max(8),
      eventTiles: z.array(eventTileSchema).max(12).optional(),
      compare: compareSchema,
    })
    .superRefine((value, ctx) => {
      if (value.tiles.length + (value.eventTiles?.length ?? 0) === 0) {
        ctx.addIssue({ code: "custom", message: "A snapshot needs at least one tile", path: ["tiles"] })
      }
    }),
  notes: z.object({ text: z.string().max(2000) }),
  traffic: z.object({
    bars: z.array(z.enum(["pageViews", "sessions"])).min(1).max(2),
  }),
  srcmed: z.object({
    topN: z.number().int().min(1).max(50),
    columns: z.array(z.enum(["users", "sessions", "keyEvents", "engagementRate"])).min(1),
    // The old showChange flag is gone; `compare` draws the % change columns. Saved
    // layouts that still carry showChange load as before: the object strips it.
    shade: z.boolean(),
    compare: compareSchema,
  }),
  pages: z.object({
    topN: z.number().int().min(1).max(50),
    compare: compareSchema,
    /** REP-6: average engagement time column. Off when absent, so saved reports read as before. */
    engagementTime: z.boolean().optional(),
  }),
  landing: z.object({ topN: z.number().int().min(1).max(50), compare: compareSchema }),
  location: z.object({
    topN: z.number().int().min(1).max(50).default(10),
    /** REP-6: Total users column (sum of daily). Off when absent. */
    totalUsers: z.boolean().optional(),
  }).strict(),
  events: z.object({}).strict(),
  gscKpi: z.object({
    tiles: z.array(z.enum(["clicks", "impressions", "ctr", "position"])).min(1).max(4),
    compare: compareSchema,
  }),
  queries: z.object({
    mode: z.enum(["all", "brand", "non_brand"]),
    topN: z.number().int().min(1).max(50),
  }),
  gscPages: z.object({ topN: z.number().int().min(1).max(50) }),
  paidSpend: z.object({}).strict(),
  searchAds: z.object({
    tiles: z.array(z.enum(SEARCH_ADS_METRICS)).min(1).max(3),
    platform: z.enum(SEARCH_ADS_PLATFORMS),
    /** Case-insensitive match on the campaign name, e.g. "Brand". Blank keeps every campaign. */
    campaignContains: z.string().trim().max(80).optional(),
    /** Tile title prefix, e.g. "Brand Search". Defaults to "Google Ads" or "Paid search". */
    label: tileLabelSchema.optional(),
    compare: compareSchema,
  }),
  /** REP-6: paid social from SOCIAL_PACING_FACT, every platform, with a platform filter. */
  socialAds: z.object({
    tiles: z.array(z.enum(SOCIAL_ADS_METRICS)).min(1).max(3),
    platform: z.enum(SOCIAL_ADS_PLATFORMS),
    /** Case-insensitive match on the campaign name. Blank keeps every campaign. */
    campaignContains: z.string().trim().max(80).optional(),
    /** Tile title prefix. Defaults to the platform, e.g. "Meta Ads" or "Paid social". */
    label: tileLabelSchema.optional(),
    compare: compareSchema,
  }),
  costPer: z.object({ eventName: z.string().trim().min(1).max(80).optional() }),
  gscTrend: z.object({}).strict(),
  queryBubble: z.object({}).strict(),
  queryPositions: z.object({}).strict(),
  kpiTracker: z.object({
    kpiIds: z.array(z.string().uuid()).max(6),
    months: z.enum(["6", "12"]),
  }),
} as const

export type WebElementId = keyof typeof elementSettings

export type WebElementSettings<K extends WebElementId = WebElementId> = z.infer<(typeof elementSettings)[K]>

export type WebDataNeed = "ga4" | "gsc" | "paid" | "notes" | "kpis"

export type WebElementDefinition<K extends WebElementId = WebElementId> = {
  id: K
  title: string
  group: WebElementGroup
  settings: (typeof elementSettings)[K]
  dataNeeds: readonly WebDataNeed[]
  /** First entry is the default display. */
  displays: readonly WebDisplay[]
  defaultWidth: WebWidth
}

export const WEB_REPORT_ELEMENTS: { [K in WebElementId]: WebElementDefinition<K> } = {
  kpis: {
    id: "kpis",
    title: "Key KPIs",
    group: "Headline",
    settings: elementSettings.kpis,
    dataNeeds: ["ga4", "gsc", "paid", "kpis"],
    displays: ["tiles", "spark", "bullet"],
    defaultWidth: 12,
  },
  kpiTracker: {
    id: "kpiTracker",
    title: "KPI tracker",
    group: "Headline",
    settings: elementSettings.kpiTracker,
    dataNeeds: ["kpis"],
    displays: ["combo", "column", "table"],
    defaultWidth: 12,
  },
  snapshot: {
    id: "snapshot",
    title: "Key snapshot",
    group: "Headline",
    settings: elementSettings.snapshot,
    dataNeeds: ["ga4", "gsc", "paid"],
    displays: ["tiles", "spark"],
    defaultWidth: 12,
  },
  notes: {
    id: "notes",
    title: "Notes",
    group: "Headline",
    settings: elementSettings.notes,
    dataNeeds: ["notes"],
    displays: ["text"],
    defaultWidth: 12,
  },
  traffic: {
    id: "traffic",
    title: "Traffic and conversions",
    group: "Google Analytics 4",
    settings: elementSettings.traffic,
    dataNeeds: ["ga4"],
    displays: ["combo", "line", "area", "column", "calendar"],
    defaultWidth: 12,
  },
  srcmed: {
    id: "srcmed",
    title: "Source / medium",
    group: "Google Analytics 4",
    settings: elementSettings.srcmed,
    dataNeeds: ["ga4"],
    displays: ["table", "bar", "donut", "treemap", "waterfall"],
    defaultWidth: 6,
  },
  pages: {
    id: "pages",
    title: "Page title",
    group: "Google Analytics 4",
    settings: elementSettings.pages,
    dataNeeds: ["ga4"],
    displays: ["table", "bar", "treemap"],
    defaultWidth: 6,
  },
  landing: {
    id: "landing",
    title: "Pages by path",
    group: "Google Analytics 4",
    settings: elementSettings.landing,
    dataNeeds: ["ga4"],
    displays: ["table", "bar", "treemap"],
    defaultWidth: 6,
  },
  location: {
    id: "location",
    title: "Location",
    group: "Google Analytics 4",
    settings: elementSettings.location,
    dataNeeds: ["ga4"],
    displays: ["table", "bar"],
    defaultWidth: 6,
  },
  events: {
    id: "events",
    title: "Events by source",
    group: "Google Analytics 4",
    settings: elementSettings.events,
    dataNeeds: ["ga4"],
    displays: ["table", "bar"],
    defaultWidth: 6,
  },
  gscKpi: {
    id: "gscKpi",
    title: "Search Console",
    group: "Search Console",
    settings: elementSettings.gscKpi,
    dataNeeds: ["gsc"],
    displays: ["tiles", "spark"],
    defaultWidth: 12,
  },
  gscTrend: {
    id: "gscTrend",
    title: "Search trend",
    group: "Search Console",
    settings: elementSettings.gscTrend,
    dataNeeds: ["gsc"],
    displays: ["line", "combo", "area", "calendar"],
    defaultWidth: 12,
  },
  queries: {
    id: "queries",
    title: "Queries",
    group: "Search Console",
    settings: elementSettings.queries,
    dataNeeds: ["gsc"],
    displays: ["table", "bar"],
    defaultWidth: 6,
  },
  queryBubble: {
    id: "queryBubble",
    title: "Query opportunities",
    group: "Search Console",
    settings: elementSettings.queryBubble,
    dataNeeds: ["gsc"],
    displays: ["bubble"],
    defaultWidth: 6,
  },
  queryPositions: {
    id: "queryPositions",
    title: "Query positions",
    group: "Search Console",
    settings: elementSettings.queryPositions,
    dataNeeds: ["gsc"],
    displays: ["histogram"],
    defaultWidth: 6,
  },
  gscPages: {
    id: "gscPages",
    title: "Search pages",
    group: "Search Console",
    settings: elementSettings.gscPages,
    dataNeeds: ["gsc"],
    displays: ["table", "bar", "treemap"],
    defaultWidth: 6,
  },
  paidSpend: {
    id: "paidSpend",
    title: "Paid media",
    group: "Paid media",
    settings: elementSettings.paidSpend,
    dataNeeds: ["paid"],
    displays: ["tiles", "bar"],
    defaultWidth: 6,
  },
  searchAds: {
    id: "searchAds",
    title: "Paid search",
    group: "Paid media",
    settings: elementSettings.searchAds,
    dataNeeds: ["paid"],
    displays: ["tiles"],
    defaultWidth: 12,
  },
  socialAds: {
    id: "socialAds",
    title: "Paid social",
    group: "Paid media",
    settings: elementSettings.socialAds,
    dataNeeds: ["paid"],
    displays: ["tiles"],
    defaultWidth: 12,
  },
  costPer: {
    id: "costPer",
    title: "Cost per key event",
    group: "Paid media",
    settings: elementSettings.costPer,
    dataNeeds: ["paid", "ga4"],
    displays: ["tiles"],
    defaultWidth: 6,
  },
}

export type WebReportLayoutItem = {
  elementId: WebElementId
  settings: unknown
  display?: WebDisplay
  width?: WebWidth
}

const warnedLayoutChrome = new Set<string>()

function warnLayoutChrome(key: string, message: string) {
  if (warnedLayoutChrome.has(key)) return
  warnedLayoutChrome.add(key)
  console.warn(message)
}

/** Keeps a display or width only when the element allows it. Invalid values are dropped and warned once. */
export function readLayoutChrome(
  elementId: WebElementId,
  entry: { display?: unknown; width?: unknown },
): Pick<WebReportLayoutItem, "display" | "width"> {
  const definition = WEB_REPORT_ELEMENTS[elementId]
  const chrome: Pick<WebReportLayoutItem, "display" | "width"> = {}
  if (entry.display !== undefined) {
    if (typeof entry.display === "string" && definition.displays.includes(entry.display as WebDisplay)) {
      chrome.display = entry.display as WebDisplay
    } else {
      warnLayoutChrome(
        `${elementId}:display:${String(entry.display)}`,
        `[web-report] display ${String(entry.display)} is not allowed for ${elementId}; using ${definition.displays[0]}`,
      )
    }
  }
  if (entry.width !== undefined) {
    if (entry.width === 12 || entry.width === 6 || entry.width === 4) {
      chrome.width = entry.width
    } else {
      warnLayoutChrome(
        `${elementId}:width:${String(entry.width)}`,
        `[web-report] width ${String(entry.width)} is not 12, 6 or 4 for ${elementId}; using ${definition.defaultWidth}`,
      )
    }
  }
  return chrome
}

export function resolveDisplay(item: WebReportLayoutItem): WebDisplay {
  const allowed = WEB_REPORT_ELEMENTS[item.elementId].displays
  if (item.display && allowed.includes(item.display)) return item.display
  return allowed[0]
}

export function resolveWidth(item: WebReportLayoutItem): WebWidth {
  if (item.width === 12 || item.width === 6 || item.width === 4) return item.width
  return WEB_REPORT_ELEMENTS[item.elementId].defaultWidth
}

/** Used until a client has a saved published report. */
export const DEFAULT_WEB_REPORT_LAYOUT: WebReportLayoutItem[] = [
  {
    elementId: "kpis",
    settings: {
      tiles: [
        { kind: "metric", metric: "sessions" },
        { kind: "metric", metric: "keyEvents" },
        { kind: "metric", metric: "engagementRate" },
        { kind: "metric", metric: "pageViews" },
      ],
    },
  },
  {
    elementId: "snapshot",
    settings: { tiles: ["sessions", "keyEvents", "clicks", "impressions", "avSpend"] },
  },
  { elementId: "traffic", settings: { bars: ["sessions", "pageViews"] } },
  {
    elementId: "srcmed",
    settings: {
      topN: 10,
      columns: ["sessions", "keyEvents"],
      shade: true,
    },
  },
  { elementId: "queries", settings: { mode: "all", topN: 15 } },
]

export function parseElementSettings<K extends WebElementId>(
  id: K,
  settings: unknown,
): { ok: true; settings: WebElementSettings<K> } | { ok: false; error: string } {
  const parsed = elementSettings[id].safeParse(settings)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") }
  }
  return { ok: true, settings: parsed.data as WebElementSettings<K> }
}

export function isWebElementId(value: string): value is WebElementId {
  return value in elementSettings
}
