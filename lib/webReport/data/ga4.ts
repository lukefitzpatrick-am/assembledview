import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"
import {
  buildGa4Slice,
  campaignRowsFromWarehouse,
  landingRowsFromWarehouse,
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
    })
  }
  const query = input.query ?? snowflakeQuery
  const from = input.current.from < input.previous.from ? input.current.from : input.previous.from
  const to = input.current.to > input.previous.to ? input.current.to : input.previous.to
  try {
    const [campaign, landing, maxRows] = await Promise.all([
      query(CAMPAIGN_SQL, [input.propertyId, from, to]),
      query(LANDING_SQL, [input.propertyId, from, to]),
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
      error: "Google Analytics 4 could not be read",
    })
  }
}

async function snowflakeQuery(sql: string, binds: unknown[]) {
  return querySnowflake<Record<string, unknown>>(sql, binds, { label: "web-report-ga4" })
}
