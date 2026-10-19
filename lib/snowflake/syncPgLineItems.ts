import "server-only"

import { fetchAllPgLineItems } from "@/lib/snowflake/fetchAllPgLineItems"
import type {
  LineItemSnapshotParityReport,
  LineItemSnapshotSource,
} from "@/lib/snowflake/lineItemSnapshotParity"
import { syncLineItemsToSnowflake } from "@/lib/snowflake/syncXanoLineItems"

/**
 * Postgres → Snowflake line-item snapshot.
 *
 * MERGE target stays `MART.XANO_LINE_ITEMS_SNAPSHOT`. The read is always
 * `fetchAllPgLineItems`. `LINE_ITEM_SNAPSHOT_SOURCE` does not select a source.
 * A value other than `postgres` is logged and ignored.
 */

export {
  buildLineItemSnapshotParityReport,
  normaliseLineItemSnapshotSource,
  spendFromBurstsJson,
  type LineItemSnapshotParityReport,
  type LineItemSnapshotSource,
  type MbaParityRow,
} from "@/lib/snowflake/lineItemSnapshotParity"

export type SyncLineItemsResult = {
  total: number
  succeeded: number
  failed: number
  errors: string[]
  batches: number
  duplicates_collapsed: number
}

export type RunLineItemSnapshotSyncResult = {
  source: LineItemSnapshotSource
  write_source: "xano" | "postgres" | "none"
  fetch_complete: boolean
  sync: SyncLineItemsResult | null
  parity: LineItemSnapshotParityReport | null
}

/**
 * Fetch published tip line items from Postgres and MERGE them into Snowflake.
 * `sourceRaw` is accepted so the cron can pass `LINE_ITEM_SNAPSHOT_SOURCE`.
 * It does not choose the read.
 */
export async function runLineItemSnapshotSync(
  sourceRaw?: string | null
): Promise<RunLineItemSnapshotSyncResult> {
  const raw = sourceRaw ?? process.env.LINE_ITEM_SNAPSHOT_SOURCE
  const configured = typeof raw === "string" ? raw.trim() : ""
  if (configured && configured !== "postgres") {
    console.warn(
      `[line-item-snapshot] LINE_ITEM_SNAPSHOT_SOURCE=${configured} is ignored; snapshot always reads Postgres`
    )
  }

  const { items, complete } = await fetchAllPgLineItems()
  const sync = await syncLineItemsToSnowflake(items, complete)
  return {
    source: "postgres",
    write_source: "postgres",
    fetch_complete: complete,
    sync,
    parity: null,
  }
}

/** Convenience: PG fetch + MERGE (for scripts / post-flip cron). */
export async function syncPgLineItemsToSnowflake(): Promise<{
  fetch_complete: boolean
  sync: SyncLineItemsResult
}> {
  const { items, complete } = await fetchAllPgLineItems()
  const sync = await syncLineItemsToSnowflake(items, complete)
  return { fetch_complete: complete, sync }
}
