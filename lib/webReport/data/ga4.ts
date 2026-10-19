import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"
import {
  buildGa4Slice,
  campaignRowsFromWarehouse,
  cityRowsFromWarehouse,
  eventRowsFromWarehouse,
  landingRowsFromWarehouse,
  pageTitleRowsFromWarehouse,
  sourceMediumRowsFromWarehouse,
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

// total_users does not add across days. Do not sum it for the window.
// Rank cities by engaged sessions. New users and key events do add.
const CITY_SQL = `
SELECT city,
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
    const [campaign, landing, sourceMedium, events, pageTitles, cities, maxRows] = await Promise.all([
      query(CAMPAIGN_SQL, binds),
      query(LANDING_SQL, binds),
      query(SOURCE_MEDIUM_SQL, binds),
      query(EVENTS_SQL, binds),
      query(PAGE_TITLE_SQL, binds),
      query(CITY_SQL, currentBinds),
      query(MAX_SQL, [input.propertyId]),
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
