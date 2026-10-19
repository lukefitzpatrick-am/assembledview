import { z } from "zod"

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

const metricSchema = z.enum(WEB_METRICS)

const kpiTileSchema = z
  .object({
    kind: z.enum(["metric", "keyEvent"]),
    metric: metricSchema.optional(),
    eventName: z.string().trim().min(1).max(80).optional(),
    target: z.number().positive().optional(),
  })
  .superRefine((tile, ctx) => {
    if (tile.kind === "metric" && !tile.metric) {
      ctx.addIssue({ code: "custom", message: "A metric tile needs a metric", path: ["metric"] })
    }
    if (tile.kind === "keyEvent" && !tile.eventName) {
      ctx.addIssue({ code: "custom", message: "A key event tile needs an event name", path: ["eventName"] })
    }
  })

export const elementSettings = {
  kpis: z.object({ tiles: z.array(kpiTileSchema).min(1).max(6) }),
  snapshot: z.object({ tiles: z.array(metricSchema).min(1).max(8) }),
  notes: z.object({ text: z.string().max(2000) }),
  traffic: z.object({
    bars: z.array(z.enum(["pageViews", "sessions"])).min(1).max(2),
  }),
  srcmed: z.object({
    topN: z.number().int().min(1).max(50),
    columns: z.array(z.enum(["sessions", "keyEvents", "engagementRate"])).min(1),
    showChange: z.boolean(),
    shade: z.boolean(),
  }),
  pages: z.object({ topN: z.number().int().min(1).max(50) }),
  landing: z.object({ topN: z.number().int().min(1).max(50) }),
  location: z.object({
    topN: z.number().int().min(1).max(50).default(10),
  }).strict(),
  events: z.object({}).strict(),
  gscKpi: z.object({
    tiles: z.array(z.enum(["clicks", "impressions", "ctr", "position"])).min(1).max(4),
  }),
  queries: z.object({
    mode: z.enum(["all", "brand", "non_brand"]),
    topN: z.number().int().min(1).max(50),
  }),
  gscPages: z.object({ topN: z.number().int().min(1).max(50) }),
  paidSpend: z.object({}).strict(),
  costPer: z.object({ eventName: z.string().trim().min(1).max(80).optional() }),
} as const

export type WebElementId = keyof typeof elementSettings

export type WebElementSettings<K extends WebElementId = WebElementId> = z.infer<(typeof elementSettings)[K]>

export type WebDataNeed = "ga4" | "gsc" | "paid" | "notes"

export type WebElementDefinition<K extends WebElementId = WebElementId> = {
  id: K
  title: string
  group: WebElementGroup
  settings: (typeof elementSettings)[K]
  dataNeeds: readonly WebDataNeed[]
}

export const WEB_REPORT_ELEMENTS: { [K in WebElementId]: WebElementDefinition<K> } = {
  kpis: {
    id: "kpis",
    title: "Key KPIs",
    group: "Headline",
    settings: elementSettings.kpis,
    dataNeeds: ["ga4", "gsc", "paid"],
  },
  snapshot: {
    id: "snapshot",
    title: "Key snapshot",
    group: "Headline",
    settings: elementSettings.snapshot,
    dataNeeds: ["ga4", "gsc", "paid"],
  },
  notes: {
    id: "notes",
    title: "Notes",
    group: "Headline",
    settings: elementSettings.notes,
    dataNeeds: ["notes"],
  },
  traffic: {
    id: "traffic",
    title: "Traffic and conversions",
    group: "Google Analytics 4",
    settings: elementSettings.traffic,
    dataNeeds: ["ga4"],
  },
  srcmed: {
    id: "srcmed",
    title: "Source / medium",
    group: "Google Analytics 4",
    settings: elementSettings.srcmed,
    dataNeeds: ["ga4"],
  },
  pages: {
    id: "pages",
    title: "Page title",
    group: "Google Analytics 4",
    settings: elementSettings.pages,
    dataNeeds: ["ga4"],
  },
  landing: {
    id: "landing",
    title: "Pages by path",
    group: "Google Analytics 4",
    settings: elementSettings.landing,
    dataNeeds: ["ga4"],
  },
  location: {
    id: "location",
    title: "Location",
    group: "Google Analytics 4",
    settings: elementSettings.location,
    dataNeeds: ["ga4"],
  },
  events: {
    id: "events",
    title: "Events by source",
    group: "Google Analytics 4",
    settings: elementSettings.events,
    dataNeeds: ["ga4"],
  },
  gscKpi: {
    id: "gscKpi",
    title: "Search Console",
    group: "Search Console",
    settings: elementSettings.gscKpi,
    dataNeeds: ["gsc"],
  },
  queries: {
    id: "queries",
    title: "Queries",
    group: "Search Console",
    settings: elementSettings.queries,
    dataNeeds: ["gsc"],
  },
  gscPages: {
    id: "gscPages",
    title: "Search pages",
    group: "Search Console",
    settings: elementSettings.gscPages,
    dataNeeds: ["gsc"],
  },
  paidSpend: {
    id: "paidSpend",
    title: "Paid media",
    group: "Paid media",
    settings: elementSettings.paidSpend,
    dataNeeds: ["paid"],
  },
  costPer: {
    id: "costPer",
    title: "Cost per key event",
    group: "Paid media",
    settings: elementSettings.costPer,
    dataNeeds: ["paid", "ga4"],
  },
}

export type WebReportLayoutItem = {
  elementId: WebElementId
  settings: unknown
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
      showChange: true,
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
