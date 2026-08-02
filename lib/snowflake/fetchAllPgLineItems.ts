import "server-only"

import { eq } from "drizzle-orm"

import { getDb, schema } from "@/db"
import {
  mapPgLineItemToSnapshot,
  CHANNEL_TO_SOURCE_TABLE,
} from "@/lib/snowflake/pgLineItemSnapshotMap"
import type {
  FetchAllXanoLineItemsResult,
  XanoLineItem,
} from "@/lib/xano/fetchAllLineItems"

/**
 * Postgres feed for Snowflake `MART.XANO_LINE_ITEMS_SNAPSHOT` (same row shape
 * as `fetchAllXanoLineItems`). Joins `line_items` × `media_plan_versions`.
 *
 * `SOURCE_TABLE` / `XANO_ROW_ID` / `XANO_CREATED_AT` column names stay for
 * warehouse compatibility — values come from PG channel map / row id / created_at.
 */

export { CHANNEL_TO_SOURCE_TABLE, mapPgLineItemToSnapshot }

/**
 * Fetch every plan line item from Postgres (all versions), mapped to the
 * Snowflake snapshot row shape.
 */
export async function fetchAllPgLineItems(): Promise<FetchAllXanoLineItemsResult> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.lineItems.id,
      createdAt: schema.lineItems.createdAt,
      lineItemId: schema.lineItems.lineItemId,
      channel: schema.lineItems.channel,
      platform: schema.lineItems.platform,
      buyType: schema.lineItems.buyType,
      bidStrategy: schema.lineItems.bidStrategy,
      fixedCostMedia: schema.lineItems.fixedCostMedia,
      bursts: schema.lineItems.bursts,
      mbaNumber: schema.mediaPlanVersions.mbaNumber,
    })
    .from(schema.lineItems)
    .innerJoin(
      schema.mediaPlanVersions,
      eq(schema.lineItems.versionId, schema.mediaPlanVersions.id)
    )

  const items: XanoLineItem[] = []
  for (const row of rows) {
    const mapped = mapPgLineItemToSnapshot(row)
    if (mapped) items.push(mapped)
  }

  console.log(`[fetchAllPgLineItems] ${items.length} rows from Postgres`)
  return { items, complete: true }
}
