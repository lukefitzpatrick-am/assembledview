import { isBrandQuery } from "@/lib/webReport/brand"
import { impressionWeightedPosition } from "@/lib/webReport/position"
import { dateInWindow, type DateWindow } from "@/lib/webReport/periods"
import {
  emptyTotals,
  type DailyPoint,
  type Ga4Slice,
  type GscSlice,
  type PageRow,
  type PeriodTotals,
  type QueryRow,
  type SourceMediumRow,
} from "@/lib/webReport/types"
import { add, dateOnly, field, freshnessStatus, num, rate, text } from "@/lib/webReport/rows"

export type Ga4CampaignRow = {
  date: string
  source: string | null
  medium: string | null
  sessions: number | null
  engagedSessions: number | null
  keyEvents: number | null
}

export type Ga4LandingRow = {
  date: string
  pagePath: string
  users: number | null
  keyEvents: number | null
  pageViews: number | null
}

export type GscDailyRow = {
  date: string
  clicks: number | null
  impressions: number | null
  position: number | null
}

export type GscQueryRow = {
  query: string
  clicks: number | null
  impressions: number | null
  position: number | null
}

function campaignFromWarehouse(row: Record<string, unknown>): Ga4CampaignRow | null {
  const date = dateOnly(field(row, "date"))
  if (!date) return null
  return {
    date,
    source: text(field(row, "session_source")),
    medium: text(field(row, "session_medium")),
    sessions: num(field(row, "sessions")),
    engagedSessions: num(field(row, "engaged_sessions")),
    keyEvents: num(field(row, "key_events")),
  }
}

function landingFromWarehouse(row: Record<string, unknown>): Ga4LandingRow | null {
  const date = dateOnly(field(row, "date"))
  const pagePath = text(field(row, "page_path"))
  if (!date || !pagePath) return null
  return {
    date,
    pagePath,
    users: num(field(row, "total_users")),
    keyEvents: num(field(row, "key_events")),
    pageViews: num(field(row, "screen_page_views")),
  }
}

function sumCampaign(rows: Ga4CampaignRow[]): Pick<PeriodTotals, "sessions" | "engagedSessions" | "engagementRate" | "keyEvents"> {
  let sessions: number | null = null
  let engaged: number | null = null
  let keyEvents: number | null = null
  for (const row of rows) {
    sessions = add(sessions, row.sessions)
    engaged = add(engaged, row.engagedSessions)
    keyEvents = add(keyEvents, row.keyEvents)
  }
  return {
    sessions,
    engagedSessions: engaged,
    engagementRate: rate(engaged, sessions),
    keyEvents,
  }
}

function pageTotals(rows: Ga4LandingRow[]): { pageViews: number | null; pages: PageRow[] } {
  let pageViews: number | null = null
  const byPage = new Map<string, PageRow>()
  for (const row of rows) {
    pageViews = add(pageViews, row.pageViews)
    const existing = byPage.get(row.pagePath) ?? { page: row.pagePath, pageViews: 0, users: 0, keyEvents: 0 }
    existing.pageViews += row.pageViews ?? 0
    existing.users += row.users ?? 0
    existing.keyEvents += row.keyEvents ?? 0
    byPage.set(row.pagePath, existing)
  }
  const pages = [...byPage.values()].sort((a, b) => b.pageViews - a.pageViews || a.page.localeCompare(b.page))
  return { pageViews, pages }
}

function sourceMediumRows(rows: Ga4CampaignRow[]): { status: "ok" | "needs_report" | "empty"; rows: SourceMediumRow[] } {
  const usable = rows.filter((row) => row.source || row.medium)
  if (usable.length === 0) {
    return { status: rows.length === 0 ? "empty" : "needs_report", rows: [] }
  }
  const grouped = new Map<string, { source: string; medium: string; sessions: number; engaged: number; keyEvents: number }>()
  for (const row of usable) {
    const source = row.source ?? "(not set)"
    const medium = row.medium ?? "(not set)"
    const key = `${source}\u0000${medium}`
    const existing = grouped.get(key) ?? { source, medium, sessions: 0, engaged: 0, keyEvents: 0 }
    existing.sessions += row.sessions ?? 0
    existing.engaged += row.engagedSessions ?? 0
    existing.keyEvents += row.keyEvents ?? 0
    grouped.set(key, existing)
  }
  const out: SourceMediumRow[] = [...grouped.values()]
    .map((row) => ({
      source: row.source,
      medium: row.medium,
      sessions: row.sessions,
      keyEvents: row.keyEvents,
      engagementRate: rate(row.engaged, row.sessions),
    }))
    .sort((a, b) => b.sessions - a.sessions || a.source.localeCompare(b.source))
  return { status: out.length > 0 ? "ok" : "empty", rows: out }
}

export function buildGa4Slice(input: {
  connected: boolean
  today: string
  current: DateWindow
  previous: DateWindow
  maxDate: string | null
  campaign: Ga4CampaignRow[]
  landing: Ga4LandingRow[]
  error?: string | null
}): Ga4Slice {
  if (!input.connected) {
    return blankGa4("not_connected", null)
  }
  if (input.error) {
    return blankGa4("error", input.error)
  }
  const currentCampaign = input.campaign.filter((row) => dateInWindow(row.date, input.current))
  const previousCampaign = input.campaign.filter((row) => dateInWindow(row.date, input.previous))
  const currentLanding = input.landing.filter((row) => dateInWindow(row.date, input.current))
  const previousLanding = input.landing.filter((row) => dateInWindow(row.date, input.previous))
  const currentPages = pageTotals(currentLanding)
  const previousPages = pageTotals(previousLanding)
  const currentSum = sumCampaign(currentCampaign)
  const previousSum = sumCampaign(previousCampaign)
  const hasRows = input.campaign.length > 0 || input.landing.length > 0
  const status = freshnessStatus(input.maxDate, input.today, hasRows)
  const medium = sourceMediumRows(currentCampaign)
  const daily = dailyGa4(input.current, currentCampaign, currentLanding)
  return {
    status,
    maxDate: input.maxDate,
    message: status === "stale" && input.maxDate ? `Google Analytics 4 data stopped on ${input.maxDate}` : null,
    pageViewsSource: "V_GA4_LANDING_DAILY.screen_page_views",
    current: {
      ...emptyTotals(),
      ...currentSum,
      pageViews: currentPages.pageViews,
    },
    previous: {
      ...emptyTotals(),
      ...previousSum,
      pageViews: previousPages.pageViews,
    },
    daily,
    sourceMedium: medium.rows,
    sourceMediumStatus: medium.status === "ok" ? "ok" : medium.status,
    pages: currentPages.pages,
    landing: currentPages.pages,
    keyEventsByName: [],
  }
}

function dailyGa4(window: DateWindow, campaign: Ga4CampaignRow[], landing: Ga4LandingRow[]): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>()
  const ensure = (date: string) => {
    const existing = byDate.get(date)
    if (existing) return existing
    const point: DailyPoint = {
      date,
      sessions: null,
      pageViews: null,
      keyEvents: null,
      clicks: null,
      impressions: null,
    }
    byDate.set(date, point)
    return point
  }
  for (const row of campaign) {
    if (!dateInWindow(row.date, window)) continue
    const point = ensure(row.date)
    point.sessions = add(point.sessions, row.sessions)
    point.keyEvents = add(point.keyEvents, row.keyEvents)
  }
  for (const row of landing) {
    if (!dateInWindow(row.date, window)) continue
    const point = ensure(row.date)
    point.pageViews = add(point.pageViews, row.pageViews)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function blankGa4(status: Ga4Slice["status"], message: string | null): Ga4Slice {
  return {
    status,
    maxDate: null,
    message,
    pageViewsSource: null,
    current: emptyTotals(),
    previous: emptyTotals(),
    daily: [],
    sourceMedium: [],
    sourceMediumStatus: status === "not_connected" ? "not_connected" : "needs_report",
    pages: [],
    landing: [],
    keyEventsByName: [],
  }
}

export function buildGscSlice(input: {
  connected: boolean
  today: string
  current: DateWindow
  previous: DateWindow
  maxDate: string | null
  dailyRows: GscDailyRow[]
  currentQueries: GscQueryRow[]
  brandTerms: readonly string[]
  error?: string | null
}): GscSlice {
  if (!input.connected) return blankGsc("not_connected", null)
  if (input.error) return blankGsc("error", input.error)
  const currentRows = input.dailyRows.filter((row) => dateInWindow(row.date, input.current))
  const previousRows = input.dailyRows.filter((row) => dateInWindow(row.date, input.previous))
  const hasRows = input.dailyRows.length > 0 || input.currentQueries.length > 0
  const status = freshnessStatus(input.maxDate, input.today, hasRows)
  return {
    status,
    maxDate: input.maxDate,
    message: status === "stale" && input.maxDate ? `Search Console data stopped on ${input.maxDate}` : null,
    current: gscTotals(currentRows),
    previous: gscTotals(previousRows),
    daily: currentRows
      .map((row) => ({
        date: row.date,
        sessions: null,
        pageViews: null,
        keyEvents: null,
        clicks: row.clicks,
        impressions: row.impressions,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    queries: input.currentQueries
      .map((row): QueryRow => ({
        query: row.query,
        brand: isBrandQuery(row.query, input.brandTerms),
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: rate(row.clicks, row.impressions),
        position: row.position,
      }))
      .sort((a, b) => b.clicks - a.clicks || a.query.localeCompare(b.query)),
    pagesStatus: "needs_report",
  }
}

function gscTotals(rows: GscDailyRow[]): PeriodTotals {
  let clicks: number | null = null
  let impressions: number | null = null
  for (const row of rows) {
    clicks = add(clicks, row.clicks)
    impressions = add(impressions, row.impressions)
  }
  return {
    ...emptyTotals(),
    clicks,
    impressions,
    ctr: rate(clicks, impressions),
    position: impressionWeightedPosition(rows),
  }
}

function blankGsc(status: GscSlice["status"], message: string | null): GscSlice {
  return {
    status,
    maxDate: null,
    message,
    current: emptyTotals(),
    previous: emptyTotals(),
    daily: [],
    queries: [],
    pagesStatus: status === "not_connected" ? "not_connected" : "needs_report",
  }
}

export function campaignRowsFromWarehouse(rows: Record<string, unknown>[]): Ga4CampaignRow[] {
  return rows.flatMap((row) => {
    const parsed = campaignFromWarehouse(row)
    return parsed ? [parsed] : []
  })
}

export function landingRowsFromWarehouse(rows: Record<string, unknown>[]): Ga4LandingRow[] {
  return rows.flatMap((row) => {
    const parsed = landingFromWarehouse(row)
    return parsed ? [parsed] : []
  })
}

export function gscDailyFromWarehouse(rows: Record<string, unknown>[]): GscDailyRow[] {
  return rows.flatMap((row) => {
    const date = dateOnly(field(row, "date"))
    if (!date) return []
    return [
      {
        date,
        clicks: num(field(row, "clicks")),
        impressions: num(field(row, "impressions")),
        position: num(field(row, "position")),
      },
    ]
  })
}

export function gscQueriesFromWarehouse(rows: Record<string, unknown>[]): GscQueryRow[] {
  return rows.flatMap((row) => {
    const query = text(field(row, "query"))
    if (!query) return []
    return [
      {
        query,
        clicks: num(field(row, "clicks")),
        impressions: num(field(row, "impressions")),
        position: num(field(row, "position")),
      },
    ]
  })
}
