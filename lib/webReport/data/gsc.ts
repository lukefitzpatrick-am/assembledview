import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"
import { buildGscSlice, gscDailyFromWarehouse, gscQueriesFromWarehouse } from "@/lib/webReport/aggregate"
import { dateOnly, field, isMissingMartView } from "@/lib/webReport/rows"
import type { DateWindow } from "@/lib/webReport/periods"
import type { GscSlice, WarehouseQuery } from "@/lib/webReport/types"

const DAILY_SQL = `
SELECT date, clicks, impressions, position
FROM ASSEMBLEDVIEW.MART.V_GSC_SITE_DAILY
WHERE site = ?
  AND date BETWEEN ? AND ?
`

const QUERY_SQL = `
SELECT query,
  SUM(clicks) AS clicks,
  SUM(impressions) AS impressions,
  SUM(position * impressions) / NULLIF(SUM(impressions), 0) AS position
FROM ASSEMBLEDVIEW.MART.V_GSC_QUERY_DAILY
WHERE site = ?
  AND date BETWEEN ? AND ?
GROUP BY query
`

const MAX_SQL = `
SELECT MAX(date) AS max_date
FROM ASSEMBLEDVIEW.MART.V_GSC_SITE_DAILY
WHERE site = ?
`

export async function readGsc(input: {
  site: string | null
  today: string
  current: DateWindow
  previous: DateWindow
  brandTerms: readonly string[]
  query?: WarehouseQuery
}): Promise<GscSlice> {
  if (!input.site) {
    return buildGscSlice({
      connected: false,
      today: input.today,
      current: input.current,
      previous: input.previous,
      maxDate: null,
      dailyRows: [],
      currentQueries: [],
      brandTerms: input.brandTerms,
    })
  }
  const query = input.query ?? snowflakeQuery
  const from = input.current.from < input.previous.from ? input.current.from : input.previous.from
  const to = input.current.to > input.previous.to ? input.current.to : input.previous.to
  try {
    const [daily, queries, maxRows] = await Promise.all([
      query(DAILY_SQL, [input.site, from, to]),
      query(QUERY_SQL, [input.site, input.current.from, input.current.to]),
      query(MAX_SQL, [input.site]),
    ])
    return buildGscSlice({
      connected: true,
      today: input.today,
      current: input.current,
      previous: input.previous,
      maxDate: dateOnly(field(maxRows[0] ?? {}, "max_date")),
      dailyRows: gscDailyFromWarehouse(daily),
      currentQueries: gscQueriesFromWarehouse(queries),
      brandTerms: input.brandTerms,
    })
  } catch (err) {
    if (isMissingMartView(err, "v_gsc_")) {
      console.warn("[web-report] Search Console MART view is not available")
    } else {
      console.error("[web-report] Search Console read failed", err)
    }
    return buildGscSlice({
      connected: true,
      today: input.today,
      current: input.current,
      previous: input.previous,
      maxDate: null,
      dailyRows: [],
      currentQueries: [],
      brandTerms: input.brandTerms,
      error: "Search Console could not be read",
    })
  }
}

async function snowflakeQuery(sql: string, binds: unknown[]) {
  return querySnowflake<Record<string, unknown>>(sql, binds, { label: "web-report-gsc" })
}
