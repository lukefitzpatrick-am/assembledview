import "server-only"

import { fetchAllPgLineItems } from "@/lib/snowflake/fetchAllPgLineItems"
import {
  buildLineItemSnapshotParityReport,
  normaliseLineItemSnapshotSource,
  type LineItemSnapshotParityReport,
  type LineItemSnapshotSource,
} from "@/lib/snowflake/lineItemSnapshotParity"
import { syncLineItemsToSnowflake } from "@/lib/snowflake/syncXanoLineItems"
import { fetchAllXanoLineItems } from "@/lib/xano/fetchAllLineItems"

/**
 * X7 — Postgres → Snowflake line-item snapshot path.
 *
 * MERGE target / column schema unchanged (`MART.XANO_LINE_ITEMS_SNAPSHOT`).
 * Cron source gated by `LINE_ITEM_SNAPSHOT_SOURCE`:
 *   - `xano` (default) — legacy crawl + MERGE
 *   - `parity` — fetch both, report MBA row/spend diffs, MERGE **Xano only**
 *   - `postgres` — MERGE PG (Luke flips after clean parity; STOP until then)
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
 * Orchestrate snapshot ingest. Parity never writes PG into Snowflake.
 */
export async function runLineItemSnapshotSync(
  sourceRaw?: string | null
): Promise<RunLineItemSnapshotSyncResult> {
  const source = normaliseLineItemSnapshotSource(
    sourceRaw ?? process.env.LINE_ITEM_SNAPSHOT_SOURCE
  )

  if (source === "postgres") {
    const { items, complete } = await fetchAllPgLineItems()
    const sync = await syncLineItemsToSnowflake(items, complete)
    return {
      source,
      write_source: "postgres",
      fetch_complete: complete,
      sync,
      parity: null,
    }
  }

  if (source === "parity") {
    const [xanoResult, pgResult] = await Promise.all([
      fetchAllXanoLineItems(),
      fetchAllPgLineItems(),
    ])
    const parity = buildLineItemSnapshotParityReport(
      xanoResult.items,
      pgResult.items,
      {
        xanoComplete: xanoResult.complete,
        pgComplete: pgResult.complete,
      }
    )
    console.log(
      `[line-item-snapshot] parity: xano=${parity.xano_deduped} pg=${parity.pg_deduped} mba_mismatches=${parity.mba_mismatches} spend_delta_abs=${parity.spend_delta_abs_sum}`
    )
    // Do not switch — keep warehouse on Xano until Luke flips source=postgres.
    const sync = await syncLineItemsToSnowflake(
      xanoResult.items,
      xanoResult.complete
    )
    return {
      source,
      write_source: "xano",
      fetch_complete: xanoResult.complete && pgResult.complete,
      sync,
      parity,
    }
  }

  const { items, complete } = await fetchAllXanoLineItems()
  const sync = await syncLineItemsToSnowflake(items, complete)
  return {
    source,
    write_source: "xano",
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
