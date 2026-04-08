import "server-only"

import { querySnowflake } from "@/lib/snowflake/client"
import { SQL_SEARCH_MAPPINGS_NO_RECENT_DELIVERY } from "@/lib/pacing/searchMappingsVerificationSql"
import type { SearchMappingNoRecentDeliveryRow } from "@/lib/xano/pacing-types"

function str(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v === undefined || v === null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return null
}

export async function fetchSearchMappingsNoRecentDelivery(): Promise<SearchMappingNoRecentDeliveryRow[]> {
  const raw =
    (await querySnowflake<Record<string, unknown>>(SQL_SEARCH_MAPPINGS_NO_RECENT_DELIVERY, [], {
      label: "pacing_search_no_recent_delivery",
    })) ?? []
  return raw.map((row) => ({
    av_line_item_id: str(row, "AV_LINE_ITEM_ID", "av_line_item_id"),
    av_line_item_label: str(row, "AV_LINE_ITEM_LABEL", "av_line_item_label"),
    av_line_item_code: str(row, "AV_LINE_ITEM_CODE", "av_line_item_code"),
  }))
}
