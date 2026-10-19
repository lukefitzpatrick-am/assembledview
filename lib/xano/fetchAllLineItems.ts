import "server-only"

/**
 * Row shape for Snowflake `MART.XANO_LINE_ITEMS_SNAPSHOT`.
 * Postgres fills these fields in `fetchAllPgLineItems`. The table name stays.
 */

export interface XanoLineItem {
  line_item_id: string
  mba_number: string
  line_item_name: string
  platform: string | null
  buy_type: string | null
  fixed_cost_media: boolean
  bursts_json: unknown[]
  source_table: string
  xano_row_id: number
  /** Unix milliseconds (normalized from Xano `created_at`). */
  xano_created_at: number
  /** Postgres `line_items.no_adserving`. Absent on a Xano crawl row. */
  no_adserving?: boolean
  /** Computed in the Postgres mapper. Absent on a Xano crawl row. */
  assume_spend?: boolean
  /**
   * Version FK from a channel row (`media_plan_version` / `_id`).
   * Used for tip-scope parity only — not written to Snowflake.
   */
  media_plan_version_id?: number | null
  /** Version number from a channel row — tip-scope fallback. */
  version_number?: number | null
}

export interface FetchAllXanoLineItemsResult {
  items: XanoLineItem[]
  complete: boolean
}
