import "server-only"

import { querySnowflake } from "@/lib/snowflake/query"
import type { DateWindow } from "@/lib/webReport/periods"
import { readSocialAdsWith } from "@/lib/webReport/socialAds"
import type { SocialAdsSlice, WarehouseQuery } from "@/lib/webReport/types"

export async function readSocialAds(input: {
  lineItemIds: ReadonlySet<string>
  current: DateWindow
  previous: DateWindow
  query?: WarehouseQuery
}): Promise<SocialAdsSlice> {
  return readSocialAdsWith({ ...input, query: input.query ?? snowflakeQuery })
}

async function snowflakeQuery(sql: string, binds: unknown[]) {
  return querySnowflake<Record<string, unknown>>(sql, binds, { label: "web-report-social-ads" })
}
