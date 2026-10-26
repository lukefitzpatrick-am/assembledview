import { isBrandQuery } from "@/lib/webReport/brand"
import { impressionWeightedPosition } from "@/lib/webReport/position"
import { dateInWindow, type DateWindow } from "@/lib/webReport/periods"
import {
  emptyTotals,
  type DailyPoint,
  type Ga4Slice,
  type GscSlice,
  type CityRow,
  type PageRow,
  type PeriodTotals,
  type QueryRow,
  type SearchPageRow,
  type SourceMediumRow,
} from "@/lib/webReport/types"
import { add, dateOnly, field, freshnessStatus, num, rate, text } from "@/lib/webReport/rows"

export type Ga4CampaignRow = {
  date: string
  sessions: number | null
  engagedSessions: number | null
  keyEvents: number | null
}

export type Ga4SourceMediumRow = {
  date: string
  source: string | null
  medium: string | null
  sessions: number | null
  engagedSessions: number | null
  keyEvents: number | null
  totalUsers: number | null
}

export type Ga4EventRow = {
  date: string
  eventName: string
  eventCount: number | null
}

export type Ga4PageTitleRow = {
  date: string
  pageTitle: string
  users: number | null
  newUsers: number | null
  keyEvents: number | null
  pageViews: number | null
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

export type GscPageRow = {
  page: string
  clicks: number | null
  impressions: number | null
  position: number | null
}

function campaignFromWarehouse(row: Record<string, unknown>): Ga4CampaignRow | null {
  const date = dateOnly(field(row, "date"))
  if (!date) return null
  return {
    date,
    sessions: num(field(row, "sessions")),
    engagedSessions: num(field(row, "engaged_sessions")),
    keyEvents: num(field(row, "key_events")),
  }
}

function sourceMediumFromWarehouse(row: Record<string, unknown>): Ga4SourceMediumRow | null {
  const date = dateOnly(field(row, "date"))
  if (!date) return null
  return {
    date,
    source: text(field(row, "session_source")),
    medium: text(field(row, "session_medium")),
    sessions: num(field(row, "sessions")),
    engagedSessions: num(field(row, "engaged_sessions")),
    keyEvents: num(field(row, "key_events")),
    totalUsers: num(field(row, "total_users")),
  }
}

function eventFromWarehouse(row: Record<string, unknown>): Ga4EventRow | null {
  const date = dateOnly(field(row, "date"))
  const eventName = text(field(row, "event_name"))
  if (!date || !eventName) return null
  return {
    date,
    eventName,
    eventCount: num(field(row, "event_count")),
  }
}

function pageTitleFromWarehouse(row: Record<string, unknown>): Ga4PageTitleRow | null {
  const date = dateOnly(field(row, "date"))
  const pageTitle = text(field(row, "page_title"))
  if (!date || !pageTitle) return null
  return {
    date,
    pageTitle,
    users: num(field(row, "total_users")),
    newUsers: num(field(row, "new_users")),
    keyEvents: num(field(row, "key_events")),
    pageViews: num(field(row, "screen_page_views")),
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

function sumUsers(rows: Ga4SourceMediumRow[]): number | null {
  let users: number | null = null
  for (const row of rows) users = add(users, row.totalUsers)
  return users
}

function sourceMediumKey(source: string | null, medium: string | null): string {
  return `${source ?? "(not set)"}\u0000${medium ?? "(not set)"}`
}

function sourceMediumRows(
  rows: Ga4SourceMediumRow[],
  previous: Ga4SourceMediumRow[] = [],
): { status: "ok" | "empty"; rows: SourceMediumRow[] } {
  if (rows.length === 0) return { status: "empty", rows: [] }
  type Group = { source: string; medium: string; sessions: number; engaged: number; keyEvents: number; users: number }
  const group = (list: Ga4SourceMediumRow[]) => {
    const grouped = new Map<string, Group>()
    for (const row of list) {
      const source = row.source ?? "(not set)"
      const medium = row.medium ?? "(not set)"
      const key = sourceMediumKey(row.source, row.medium)
      const existing = grouped.get(key) ?? { source, medium, sessions: 0, engaged: 0, keyEvents: 0, users: 0 }
      existing.sessions += row.sessions ?? 0
      existing.engaged += row.engagedSessions ?? 0
      existing.keyEvents += row.keyEvents ?? 0
      existing.users += row.totalUsers ?? 0
      grouped.set(key, existing)
    }
    return grouped
  }
  const grouped = group(rows)
  const before = group(previous)
  const out: SourceMediumRow[] = [...grouped.values()]
    .map((row) => {
      const prior = before.get(sourceMediumKey(row.source, row.medium))
      return {
        source: row.source,
        medium: row.medium,
        sessions: row.sessions,
        keyEvents: row.keyEvents,
        engagementRate: rate(row.engaged, row.sessions),
        previousSessions: prior?.sessions ?? 0,
        users: row.users,
        previous: {
          sessions: prior?.sessions ?? 0,
          keyEvents: prior?.keyEvents ?? 0,
          users: prior?.users ?? 0,
          engagementRate: prior ? rate(prior.engaged, prior.sessions) : null,
        },
      }
    })
    .sort((a, b) => b.sessions - a.sessions || a.source.localeCompare(b.source))
  return { status: out.length > 0 ? "ok" : "empty", rows: out }
}

function keyEventTotals(
  current: Ga4EventRow[],
  previous: Ga4EventRow[],
): { name: string; count: number; previous: number }[] {
  const currentMap = new Map<string, number>()
  const previousMap = new Map<string, number>()
  for (const row of current) {
    currentMap.set(row.eventName, (currentMap.get(row.eventName) ?? 0) + (row.eventCount ?? 0))
  }
  for (const row of previous) {
    previousMap.set(row.eventName, (previousMap.get(row.eventName) ?? 0) + (row.eventCount ?? 0))
  }
  const names = new Set([...currentMap.keys(), ...previousMap.keys()])
  return [...names]
    .map((name) => ({
      name,
      count: currentMap.get(name) ?? 0,
      previous: previousMap.get(name) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export type Ga4CityRow = {
  city: string
  engagedSessions: number | null
  newUsers: number | null
  keyEvents: number | null
}

const UNSET_CITY = "(not set)"

/**
 * Rank cities by engaged sessions. total_users does not add across days, so it
 * is not summed and is not shown. New users, engaged sessions, and key events
 * do add. "(not set)" stays off the ranking and is appended last when present.
 * Key event rate is key events / engaged sessions, and is null when engaged
 * sessions are zero.
 */
export function rankCities(rows: Ga4CityRow[]): CityRow[] {
  const ranked: CityRow[] = []
  let unset: CityRow | null = null
  for (const row of rows) {
    const item: CityRow = {
      city: row.city,
      engagedSessions: row.engagedSessions ?? 0,
      newUsers: row.newUsers ?? 0,
      keyEvents: row.keyEvents ?? 0,
      keyEventRate: rate(row.keyEvents, row.engagedSessions),
    }
    if (row.city === UNSET_CITY) unset = item
    else ranked.push(item)
  }
  ranked.sort((a, b) => b.engagedSessions - a.engagedSessions || a.city.localeCompare(b.city))
  if (unset) ranked.push(unset)
  return ranked
}

export function buildGa4Slice(input: {
  connected: boolean
  today: string
  current: DateWindow
  previous: DateWindow
  maxDate: string | null
  campaign: Ga4CampaignRow[]
  landing: Ga4LandingRow[]
  sourceMedium: Ga4SourceMediumRow[]
  events: Ga4EventRow[]
  pageTitles: Ga4PageTitleRow[]
  cities?: Ga4CityRow[]
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
  const currentSource = input.sourceMedium.filter((row) => dateInWindow(row.date, input.current))
  const previousSource = input.sourceMedium.filter((row) => dateInWindow(row.date, input.previous))
  const currentEvents = input.events.filter((row) => dateInWindow(row.date, input.current))
  const previousEvents = input.events.filter((row) => dateInWindow(row.date, input.previous))
  const currentTitles = input.pageTitles.filter((row) => dateInWindow(row.date, input.current))
  const previousTitles = input.pageTitles.filter((row) => dateInWindow(row.date, input.previous))
  const currentLandingPages = pageTotals(currentLanding)
  const previousLandingPages = pageTotals(previousLanding)
  const asLanding = (list: Ga4PageTitleRow[]): Ga4LandingRow[] =>
    list.map((row) => ({
      date: row.date,
      pagePath: row.pageTitle,
      users: row.users,
      keyEvents: row.keyEvents,
      pageViews: row.pageViews,
    }))
  const currentTitlePages = pageTotals(asLanding(currentTitles))
  const previousTitlePages = pageTotals(asLanding(previousTitles))
  const currentSum = sumCampaign(currentCampaign)
  const previousSum = sumCampaign(previousCampaign)
  const cities = rankCities(input.cities ?? [])
  const hasRows =
    input.campaign.length > 0 ||
    input.landing.length > 0 ||
    input.sourceMedium.length > 0 ||
    input.events.length > 0 ||
    input.pageTitles.length > 0 ||
    cities.length > 0
  const status = freshnessStatus(input.maxDate, input.today, hasRows)
  const medium = sourceMediumRows(currentSource, previousSource)
  const daily = dailyGa4(input.current, currentCampaign, currentLanding)
  return {
    status,
    maxDate: input.maxDate,
    message: status === "stale" && input.maxDate ? `Google Analytics 4 data stopped on ${input.maxDate}` : null,
    pageViewsSource: "V_GA4_LANDING_DAILY.screen_page_views",
    current: {
      ...emptyTotals(),
      ...currentSum,
      users: sumUsers(currentSource),
      pageViews: currentLandingPages.pageViews,
    },
    previous: {
      ...emptyTotals(),
      ...previousSum,
      users: sumUsers(previousSource),
      pageViews: previousLandingPages.pageViews,
    },
    daily,
    sourceMedium: medium.rows,
    sourceMediumStatus: medium.status,
    pages: withPreviousPages(currentTitlePages.pages, previousTitlePages.pages),
    landing: withPreviousPages(currentLandingPages.pages, previousLandingPages.pages),
    keyEventsByName: keyEventTotals(currentEvents, previousEvents),
    cities,
  }
}

function withPreviousPages(current: PageRow[], previous: PageRow[]): PageRow[] {
  const before = new Map(previous.map((row) => [row.page, row]))
  return current.map((row) => {
    const prior = before.get(row.page)
    return {
      ...row,
      previous: { pageViews: prior?.pageViews ?? 0, users: prior?.users ?? 0, keyEvents: prior?.keyEvents ?? 0 },
    }
  })
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
    cities: [],
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
  currentPages: GscPageRow[]
  brandTerms: readonly string[]
  error?: string | null
}): GscSlice {
  if (!input.connected) return blankGsc("not_connected", null)
  if (input.error) return blankGsc("error", input.error)
  const currentRows = input.dailyRows.filter((row) => dateInWindow(row.date, input.current))
  const previousRows = input.dailyRows.filter((row) => dateInWindow(row.date, input.previous))
  const hasRows =
    input.dailyRows.length > 0 || input.currentQueries.length > 0 || input.currentPages.length > 0
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
    pages: input.currentPages
      .map((row): SearchPageRow => ({
        page: row.page,
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: rate(row.clicks, row.impressions),
        position: row.position,
      }))
      .sort((a, b) => b.clicks - a.clicks || a.page.localeCompare(b.page)),
    pagesStatus: status,
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
    pages: [],
    pagesStatus: status,
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

export function sourceMediumRowsFromWarehouse(rows: Record<string, unknown>[]): Ga4SourceMediumRow[] {
  return rows.flatMap((row) => {
    const parsed = sourceMediumFromWarehouse(row)
    return parsed ? [parsed] : []
  })
}

export function eventRowsFromWarehouse(rows: Record<string, unknown>[]): Ga4EventRow[] {
  return rows.flatMap((row) => {
    const parsed = eventFromWarehouse(row)
    return parsed ? [parsed] : []
  })
}

export function cityRowsFromWarehouse(rows: Record<string, unknown>[]): Ga4CityRow[] {
  return rows.flatMap((row) => {
    const city = text(field(row, "city"))
    if (!city) return []
    return [
      {
        city,
        engagedSessions: num(field(row, "engaged_sessions")),
        newUsers: num(field(row, "new_users")),
        keyEvents: num(field(row, "key_events")),
      },
    ]
  })
}

export function pageTitleRowsFromWarehouse(rows: Record<string, unknown>[]): Ga4PageTitleRow[] {
  return rows.flatMap((row) => {
    const parsed = pageTitleFromWarehouse(row)
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

export function gscPagesFromWarehouse(rows: Record<string, unknown>[]): GscPageRow[] {
  return rows.flatMap((row) => {
    const page = text(field(row, "page"))
    if (!page) return []
    return [
      {
        page,
        clicks: num(field(row, "clicks")),
        impressions: num(field(row, "impressions")),
        position: num(field(row, "position")),
      },
    ]
  })
}
