import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"
import type { DateWindow } from "@/lib/webReport/periods"
import { readSearchAdsWith } from "@/lib/webReport/searchAds"
import type { SearchAdsSlice, WarehouseQuery } from "@/lib/webReport/types"

export async function readSearchAds(input: {
  lineItemIds: ReadonlySet<string>
  current: DateWindow
  previous: DateWindow
  query?: WarehouseQuery
}): Promise<SearchAdsSlice> {
  return readSearchAdsWith({ ...input, query: input.query ?? snowflakeQuery })
}

async function snowflakeQuery(sql: string, binds: unknown[]) {
  return querySnowflake<Record<string, unknown>>(sql, binds, { label: "web-report-search-ads" })
}
