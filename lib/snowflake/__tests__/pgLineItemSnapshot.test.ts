/**
 * MART.XANO_LINE_ITEMS_SNAPSHOT row source (B7, restored from the parity test
 * deleted in B6): the nightly MERGE reads tip-scoped Postgres rows, and each
 * row carries its channel's SOURCE_TABLE.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import { CHANNEL_TO_SOURCE_TABLE, mapPgLineItemToSnapshot } from "../pgLineItemSnapshotMap"

const here = dirname(fileURLToPath(import.meta.url))

test("fetchAllPgLineItems defaults to tip scope (published_version_id), not all versions", () => {
  // Source pin; the behaviour (which query runs) is pgLineItemSnapshotScope.test.ts.
  const src = readFileSync(join(here, "../fetchAllPgLineItems.ts"), "utf8")
  assert.match(src, /options\?\.scope === "all" \? "all" : "tip"/)
  assert.match(
    src,
    /eq\(\s*schema\.mediaPlanVersions\.id,\s*schema\.mediaPlanMasters\.publishedVersionId\s*\)/,
  )
})

test("mapPgLineItemToSnapshot maps channel to SOURCE_TABLE", () => {
  assert.equal(CHANNEL_TO_SOURCE_TABLE.social, "media_plan_social")
  const mapped = mapPgLineItemToSnapshot({
    id: 42,
    createdAt: "2026-01-15T00:00:00.000Z",
    lineItemId: "LI-1",
    channel: "social",
    platform: "Meta",
    buyType: "CPC",
    bidStrategy: "Lowest",
    fixedCostMedia: false,
    bursts: [{ budget: 12 }],
    mbaNumber: "test001",
  })
  assert.ok(mapped)
  assert.equal(mapped!.source_table, "media_plan_social")
  assert.equal(mapped!.line_item_name, "Meta - Lowest - CPC")
  assert.equal(mapped!.xano_row_id, 42)
  assert.equal(mapped!.mba_number, "test001")
})
