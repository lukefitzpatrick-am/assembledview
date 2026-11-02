import "server-only"

import { fetchAllPgLineItems } from "@/lib/snowflake/fetchAllPgLineItems"
import { syncLineItemsToSnowflake } from "@/lib/snowflake/syncXanoLineItems"

/**
 * Postgres → Snowflake line-item snapshot.
 *
 * MERGE target stays `MART.XANO_LINE_ITEMS_SNAPSHOT` (frozen name). The read
 * is always `fetchAllPgLineItems`. The Xano parity mode and
 * `LINE_ITEM_SNAPSHOT_SOURCE` are gone (B6).
 */

export type SyncLineItemsResult = {
  total: number
  succeeded: number
  failed: number
  errors: string[]
  batches: number
  duplicates_collapsed: number
}

export type RunLineItemSnapshotSyncResult = {
  source: "postgres"
  write_source: "postgres"
  fetch_complete: boolean
  sync: SyncLineItemsResult | null
}

/** Fetch published tip line items from Postgres and MERGE them into Snowflake. */
export async function runLineItemSnapshotSync(): Promise<RunLineItemSnapshotSyncResult> {
  const { items, complete } = await fetchAllPgLineItems()
  const sync = await syncLineItemsToSnowflake(items, complete)
  return {
    source: "postgres",
    write_source: "postgres",
    fetch_complete: complete,
    sync,
  }
}
