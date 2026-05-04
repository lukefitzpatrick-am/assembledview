import "server-only"

import { querySnowflake } from "@/lib/snowflake/client"
import type { XanoLineItem } from "@/lib/xano/fetchAllLineItems"

const SNAPSHOT = "ASSEMBLEDVIEW.MART.XANO_LINE_ITEMS_SNAPSHOT"

/**
 * MERGE one row into `XANO_LINE_ITEMS_SNAPSHOT` keyed on `LINE_ITEM_ID`.
 * Requires `SNOWFLAKE_ROLE` (and related env) to allow DML on the mart table — typically a write-capable role.
 */
const MERGE_SQL = `
  MERGE INTO ${SNAPSHOT} t
  USING (
    SELECT
      ?::VARCHAR AS LINE_ITEM_ID,
      ?::VARCHAR AS MBA_NUMBER,
      ?::VARCHAR AS LINE_ITEM_NAME,
      ?::VARCHAR AS PLATFORM,
      ?::VARCHAR AS BUY_TYPE,
      ?::BOOLEAN AS FIXED_COST_MEDIA,
      PARSE_JSON(?) AS BURSTS_JSON,
      ?::VARCHAR AS SOURCE_TABLE,
      ?::NUMBER AS XANO_ROW_ID,
      ?::NUMBER AS XANO_CREATED_AT
  ) s
  ON t.LINE_ITEM_ID = s.LINE_ITEM_ID
  WHEN MATCHED THEN UPDATE SET
    MBA_NUMBER       = s.MBA_NUMBER,
    LINE_ITEM_NAME   = s.LINE_ITEM_NAME,
    PLATFORM         = s.PLATFORM,
    BUY_TYPE         = s.BUY_TYPE,
    FIXED_COST_MEDIA = s.FIXED_COST_MEDIA,
    BURSTS_JSON      = s.BURSTS_JSON,
    SOURCE_TABLE     = s.SOURCE_TABLE,
    XANO_ROW_ID      = s.XANO_ROW_ID,
    XANO_CREATED_AT  = s.XANO_CREATED_AT,
    SYNCED_AT        = CURRENT_TIMESTAMP()
  WHEN NOT MATCHED THEN INSERT (
    LINE_ITEM_ID, MBA_NUMBER, LINE_ITEM_NAME, PLATFORM, BUY_TYPE,
    FIXED_COST_MEDIA, BURSTS_JSON, SOURCE_TABLE, XANO_ROW_ID, XANO_CREATED_AT, SYNCED_AT
  ) VALUES (
    s.LINE_ITEM_ID, s.MBA_NUMBER, s.LINE_ITEM_NAME, s.PLATFORM, s.BUY_TYPE,
    s.FIXED_COST_MEDIA, s.BURSTS_JSON, s.SOURCE_TABLE, s.XANO_ROW_ID, s.XANO_CREATED_AT, CURRENT_TIMESTAMP()
  )
`

export async function syncLineItemsToSnowflake(items: XanoLineItem[]): Promise<{
  total: number
  succeeded: number
  failed: number
  errors: string[]
}> {
  const result = { total: items.length, succeeded: 0, failed: 0, errors: [] as string[] }

  for (const item of items) {
    try {
      const burstsPayload =
        item.bursts_json === undefined || item.bursts_json === null
          ? "[]"
          : JSON.stringify(item.bursts_json)

      await querySnowflake(
        MERGE_SQL,
        [
          item.line_item_id,
          item.mba_number,
          item.line_item_name,
          item.platform,
          item.buy_type,
          item.fixed_cost_media,
          burstsPayload,
          item.source_table,
          item.xano_row_id,
          item.xano_created_at,
        ],
        { label: "xano_line_items_snapshot_merge" }
      )
      result.succeeded += 1
    } catch (err) {
      result.failed += 1
      result.errors.push(
        `${item.line_item_id}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  return result
}
