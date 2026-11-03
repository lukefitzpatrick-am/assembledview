import "server-only"

import { and, eq, isNotNull } from "drizzle-orm"

import { getDb, schema } from "@/db"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import type { FeeLoading } from "@/lib/finance/campaignFinancials.types"
import { resolveFeePctFromFeeLoading } from "@/lib/finance/computeCampaignFinancials"
import {
  mapPgLineItemToSnapshot,
  CHANNEL_TO_SOURCE_TABLE,
  type FixedCostSnapshotFlags,
} from "@/lib/snowflake/pgLineItemSnapshotMap"
import { readDeliveryFlags } from "@/lib/delivery/deliveryFlags.server"
import type {
  FetchAllXanoLineItemsResult,
  XanoLineItem,
} from "@/lib/xano/fetchAllLineItems"

/**
 * Postgres feed for Snowflake `MART.XANO_LINE_ITEMS_SNAPSHOT` (same row shape
 * as `XanoLineItem`). Joins `line_items` × tip `media_plan_versions`.
 *
 * Tip scope = master's `published_version_id` only — matches what Xano channel
 * tables represent (live/published lines), not every historical version row.
 * Pass `scope: "all"` only for diagnostics.
 *
 * `SOURCE_TABLE` / `XANO_ROW_ID` / `XANO_CREATED_AT` column names stay for
 * warehouse compatibility — values come from PG channel map / row id / created_at.
 */

export { CHANNEL_TO_SOURCE_TABLE, mapPgLineItemToSnapshot }

export type PgLineItemSnapshotScope = "tip" | "all"

export type FetchAllPgLineItemsOptions = {
  /** Default `tip` — published version only. */
  scope?: PgLineItemSnapshotScope
  /** B23 snapshot switches. Unset reads them (a failed read is off). */
  fixedCostFlags?: FixedCostSnapshotFlags
}

/**
 * Fetch plan line items from Postgres, mapped to the Snowflake snapshot row shape.
 * Default tip-scopes to `media_plan_masters.published_version_id`.
 */
export async function fetchAllPgLineItems(
  options?: FetchAllPgLineItemsOptions
): Promise<FetchAllXanoLineItemsResult> {
  const scope: PgLineItemSnapshotScope = options?.scope === "all" ? "all" : "tip"
  const db = getDb()

  const baseSelect = {
    id: schema.lineItems.id,
    createdAt: schema.lineItems.createdAt,
    lineItemId: schema.lineItems.lineItemId,
    channel: schema.lineItems.channel,
    platform: schema.lineItems.platform,
    buyType: schema.lineItems.buyType,
    bidStrategy: schema.lineItems.bidStrategy,
    fixedCostMedia: schema.lineItems.fixedCostMedia,
    fixedCostFrom: schema.lineItems.fixedCostFrom,
    bursts: schema.lineItems.bursts,
    publisher: schema.lineItems.publisher,
    noAdserving: schema.lineItems.noAdserving,
    clientPaysForMedia: schema.lineItems.clientPaysForMedia,
    budgetIncludesFees: schema.lineItems.budgetIncludesFees,
    fees: schema.mbaFeeSnapshots.fees,
    mbaNumber: schema.mediaPlanVersions.mbaNumber,
  }

function feeLoadingFrom(raw: unknown): FeeLoading {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as FeeLoading
  return {}
}

  const withFees = db
    .select(baseSelect)
    .from(schema.lineItems)
    .innerJoin(
      schema.mediaPlanVersions,
      eq(schema.lineItems.versionId, schema.mediaPlanVersions.id)
    )
    .leftJoin(
      schema.mbaFeeSnapshots,
      eq(schema.mbaFeeSnapshots.versionId, schema.mediaPlanVersions.id)
    )

  const rows =
    scope === "all"
      ? await withFees
      : await withFees
          .innerJoin(
            schema.mediaPlanMasters,
            eq(schema.mediaPlanVersions.masterId, schema.mediaPlanMasters.id)
          )
          .where(
            and(
              isNotNull(schema.mediaPlanMasters.publishedVersionId),
              eq(
                schema.mediaPlanVersions.id,
                schema.mediaPlanMasters.publishedVersionId
              )
            )
          )

  const asOfDate = getMelbourneTodayISO()
  const flags =
    options?.fixedCostFlags ??
    (await readDeliveryFlags().then((f) => ({
      fixedCostReportNet: f.fixedCostReportNet,
      fixedCostFromDate: f.fixedCostFromDate,
    })))
  const items: XanoLineItem[] = []
  for (const row of rows) {
    const mapped = mapPgLineItemToSnapshot(
      {
        ...row,
        feePct: resolveFeePctFromFeeLoading(row.channel, feeLoadingFrom(row.fees)),
        asOfDate,
      },
      flags,
    )
    if (mapped) items.push(mapped)
  }

  console.log(
    `[fetchAllPgLineItems] ${items.length} rows from Postgres (scope=${scope})`
  )
  return { items, complete: true }
}
