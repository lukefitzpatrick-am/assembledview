import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"
import {
  buildGa4Slice,
  campaignRowsFromWarehouse,
  cityRowsFromWarehouse,
  eventRowsFromWarehouse,
  landingRowsFromWarehouse,
  pageEngagementRowsFromWarehouse,
  pageTitleRowsFromWarehouse,
  sourceMediumRowsFromWarehouse,
  type Ga4PageEngagementRow,
} from "@/lib/webReport/aggregate"
import { dateOnly, field, isMissingMartView } from "@/lib/webReport/rows"
import type { DateWindow } from "@/lib/webReport/periods"
import type { Ga4Slice, WarehouseQuery } from "@/lib/webReport/types"

const CAMPAIGN_SQL = `
SELECT date, sessions, engaged_sessions, key_events
FROM ASSEMBLEDVIEW.MART.V_GA4_CAMPAIGN_DAILY
WHERE property_id = ?
  AND date BETWEEN ? AND ?
`

const LANDING_SQL = `
SELECT date, page_path, total_users, key_events, screen_page_views
FROM ASSEMBLEDVIEW.MART.V_GA4_LANDING_DAILY
WHERE property_id = ?
  AND date BETWEEN ? AND ?
`

const SOURCE_MEDIUM_SQL = `
SELECT date, session_source, session_medium, sessions, engaged_sessions, key_events, total_users
FROM ASSEMBLEDVIEW.MART.V_GA4_SOURCE_MEDIUM_DAILY
WHERE property_id = ?
  AND date BETWEEN ? AND ?
`

const EVENTS_SQL = `
SELECT date, event_name, event_count
FROM ASSEMBLEDVIEW.MART.V_GA4_EVENTS_DAILY
WHERE property_id = ?
  AND date BETWEEN ? AND ?
`

const PAGE_TITLE_SQL = `
SELECT date, page_title, screen_page_views, total_users, new_users, key_events
FROM ASSEMBLEDVIEW.MART.V_GA4_PAGE_TITLE_DAILY
WHERE property_id = ?
  AND date BETWEEN ? AND ?
`

// REP-6: page title average engagement time. Its own query, so the rest of
// GA4 still reads while V_GA4_PAGE_TITLE_DAILY has no user_engagement_duration
// column (the view update is a Luke task).
const PAGE_ENGAGEMENT_SQL = `
SELECT page_title,
  SUM(IFF(date BETWEEN ? AND ?, user_engagement_duration, 0)) AS cur_engagement_seconds,
  SUM(IFF(date BETWEEN ? AND ?, user_engagement_duration, 0)) AS prev_engagement_seconds
FROM ASSEMBLEDVIEW.MART.V_GA4_PAGE_TITLE_DAILY
WHERE property_id = ?
  AND date BETWEEN ? AND ?
GROUP BY page_title
`

let warnedPageEngagement = false

async function readPageEngagement(
  query: WarehouseQuery,
  input: { propertyId: string; current: DateWindow; previous: DateWindow; from: string; to: string },
): Promise<Ga4PageEngagementRow[] | null> {
  try {
    const rows = await query(PAGE_ENGAGEMENT_SQL, [
      input.current.from,
      input.current.to,
      input.previous.from,
      input.previous.to,
      input.propertyId,
      input.from,
      input.to,
    ])
    return pageEngagementRowsFromWarehouse(rows)
  } catch (err) {
    if (!warnedPageEngagement) {
      warnedPageEngagement = true
      console.warn(
        "[web-report] page title engagement time is not available (V_GA4_PAGE_TITLE_DAILY.user_engagement_duration)",
        err instanceof Error ? err.message : String(err),
      )
    }
    return null
  }
}

// total_users does not add across days. It is summed only for the optional
// Total users column, which says "sum of daily" (REP-6). Rank cities by engaged
// sessions. New users and key events do add.
const CITY_SQL = `
SELECT city,
  SUM(total_users) AS total_users,
  SUM(engaged_sessions) AS engaged_sessions,
  SUM(key_events) AS key_events,
  SUM(new_users) AS new_users
FROM ASSEMBLEDVIEW.MART.V_GA4_CITY_DAILY
WHERE property_id = ?
  AND date BETWEEN ? AND ?
GROUP BY city
`

const MAX_SQL = `
SELECT MAX(date) AS max_date
FROM ASSEMBLEDVIEW.MART.V_GA4_CAMPAIGN_DAILY
WHERE property_id = ?
`

export async function readGa4(input: {
  propertyId: string | null
  today: string
  current: DateWindow
  previous: DateWindow
  query?: WarehouseQuery
}): Promise<Ga4Slice> {
  if (!input.propertyId) {
    return buildGa4Slice({
      connected: false,
      today: input.today,
      current: input.current,
      previous: input.previous,
      maxDate: null,
      campaign: [],
      landing: [],
      sourceMedium: [],
      events: [],
      pageTitles: [],
      cities: [],
    })
  }
  const query = input.query ?? snowflakeQuery
  const from = input.current.from < input.previous.from ? input.current.from : input.previous.from
  const to = input.current.to > input.previous.to ? input.current.to : input.previous.to
  const binds = [input.propertyId, from, to]
  const currentBinds = [input.propertyId, input.current.from, input.current.to]
  try {
    const [campaign, landing, sourceMedium, events, pageTitles, cities, maxRows, pageEngagement] = await Promise.all([
      query(CAMPAIGN_SQL, binds),
      query(LANDING_SQL, binds),
      query(SOURCE_MEDIUM_SQL, binds),
      query(EVENTS_SQL, binds),
      query(PAGE_TITLE_SQL, binds),
      query(CITY_SQL, currentBinds),
      query(MAX_SQL, [input.propertyId]),
      readPageEngagement(query, {
        propertyId: input.propertyId,
        current: input.current,
        previous: input.previous,
        from,
        to,
      }),
    ])
    const maxDate = dateOnly(field(maxRows[0] ?? {}, "max_date"))
    return buildGa4Slice({
      connected: true,
      today: input.today,
      current: input.current,
      previous: input.previous,
      maxDate,
      campaign: campaignRowsFromWarehouse(campaign),
      landing: landingRowsFromWarehouse(landing),
      sourceMedium: sourceMediumRowsFromWarehouse(sourceMedium),
      events: eventRowsFromWarehouse(events),
      pageTitles: pageTitleRowsFromWarehouse(pageTitles),
      cities: cityRowsFromWarehouse(cities),
      pageEngagement,
    })
  } catch (err) {
    if (isMissingMartView(err, "v_ga4_")) {
      console.warn("[web-report] GA4 MART view is not available")
    } else {
      console.error("[web-report] GA4 read failed", err)
    }
    return buildGa4Slice({
      connected: true,
      today: input.today,
      current: input.current,
      previous: input.previous,
      maxDate: null,
      campaign: [],
      landing: [],
      sourceMedium: [],
      events: [],
      pageTitles: [],
      cities: [],
      error: "Google Analytics 4 could not be read",
    })
  }
}

async function snowflakeQuery(sql: string, binds: unknown[]) {
  return querySnowflake<Record<string, unknown>>(sql, binds, { label: "web-report-ga4" })
}
