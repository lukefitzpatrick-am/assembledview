import type { DateWindow, ReportWindows } from "@/lib/webReport/periods"

export type SourceStatus = "ok" | "not_connected" | "stale" | "needs_report" | "empty" | "error"

export type DailyPoint = {
  date: string
  sessions: number | null
  pageViews: number | null
  keyEvents: number | null
  clicks: number | null
  impressions: number | null
}

export type SourceMediumRow = {
  source: string
  medium: string
  sessions: number
  keyEvents: number
  engagementRate: number | null
  /** Sessions for the same source and medium in the compared window. Omitted when that window was not rolled up. */
  previousSessions?: number
}

export type PageRow = {
  page: string
  pageViews: number
  users: number
  keyEvents: number
}

export type QueryRow = {
  query: string
  brand: boolean
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
}

export type SearchPageRow = {
  page: string
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
}

export type PeriodTotals = {
  users: number | null
  newUsers: number | null
  sessions: number | null
  engagedSessions: number | null
  engagementRate: number | null
  keyEvents: number | null
  pageViews: number | null
  clicks: number | null
  impressions: number | null
  ctr: number | null
  position: number | null
}

export type Ga4Slice = {
  status: SourceStatus
  /** Latest date on the property, when the view answered. */
  maxDate: string | null
  message: string | null
  /** Page views come from V_GA4_LANDING_DAILY.screen_page_views. */
  pageViewsSource: "V_GA4_LANDING_DAILY.screen_page_views" | null
  current: PeriodTotals
  previous: PeriodTotals
  daily: DailyPoint[]
  sourceMedium: SourceMediumRow[]
  sourceMediumStatus: SourceStatus
  /** Page titles from V_GA4_PAGE_TITLE_DAILY. */
  pages: PageRow[]
  /** Page paths from V_GA4_LANDING_DAILY. */
  landing: PageRow[]
  /** Event counts from V_GA4_EVENTS_DAILY. `previous` is the compared window. */
  keyEventsByName: { name: string; count: number; previous: number }[]
  /**
   * Cities from V_GA4_CITY_DAILY, ranked by engaged sessions.
   * "(not set)" is last when present. Key event rate is key events / engaged sessions.
   */
  cities: CityRow[]
}

export type CityRow = {
  city: string
  engagedSessions: number
  newUsers: number
  keyEvents: number
  keyEventRate: number | null
}

export type GscSlice = {
  status: SourceStatus
  maxDate: string | null
  message: string | null
  current: PeriodTotals
  previous: PeriodTotals
  daily: DailyPoint[]
  queries: QueryRow[]
  /** Landing pages from V_GSC_PAGE_DAILY. CTR is clicks / impressions. */
  pages: SearchPageRow[]
  pagesStatus: SourceStatus
}

export type PaidChannelRow = { channel: string; spend: number }

export type PaidSlice = {
  status: SourceStatus
  message: string | null
  spend: number | null
  previousSpend: number | null
  byChannel: PaidChannelRow[]
}

export type WebReportData = {
  windows: ReportWindows
  ga4Property: string | null
  gscSite: string | null
  ga4: Ga4Slice
  gsc: GscSlice
  paid: PaidSlice
}

export type WarehouseQuery = (sql: string, binds: unknown[]) => Promise<Record<string, unknown>[]>

export function emptyTotals(): PeriodTotals {
  return {
    users: null,
    newUsers: null,
    sessions: null,
    engagedSessions: null,
    engagementRate: null,
    keyEvents: null,
    pageViews: null,
    clicks: null,
    impressions: null,
    ctr: null,
    position: null,
  }
}

export function windowSpan(current: DateWindow, previous: DateWindow): DateWindow {
  const from = current.from < previous.from ? current.from : previous.from
  const to = current.to > previous.to ? current.to : previous.to
  return { from, to }
}
