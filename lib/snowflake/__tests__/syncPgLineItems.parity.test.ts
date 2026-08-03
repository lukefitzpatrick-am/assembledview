import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

import type { XanoLineItem } from "../../xano/fetchAllLineItems.js"
import {
  buildLineItemSnapshotParityReport,
  normaliseLineItemSnapshotSource,
  spendFromBurstsJson,
} from "../lineItemSnapshotParity.js"
import { CHANNEL_TO_SOURCE_TABLE, mapPgLineItemToSnapshot } from "../pgLineItemSnapshotMap.js"
import {
  filterXanoItemsToPublishedTips,
  type PublishedTipPointer,
} from "../tipScopeLineItems.js"

function item(overrides: Partial<XanoLineItem> & { line_item_id: string }): XanoLineItem {
  return {
    mba_number: "mba1",
    line_item_name: "n",
    platform: null,
    buy_type: null,
    fixed_cost_media: false,
    bursts_json: [],
    source_table: "media_plan_search",
    xano_row_id: 1,
    xano_created_at: 1,
    ...overrides,
  }
}

test("normaliseLineItemSnapshotSource", () => {
  assert.equal(normaliseLineItemSnapshotSource(undefined), "xano")
  assert.equal(normaliseLineItemSnapshotSource("parity"), "parity")
  assert.equal(normaliseLineItemSnapshotSource("PG"), "postgres")
  assert.equal(normaliseLineItemSnapshotSource("postgres"), "postgres")
})

test("PG snapshot default scope is tip (published_version_id), not all versions", () => {
  // Contract check without importing server-only fetchAllPgLineItems.
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, "../fetchAllPgLineItems.ts"), "utf8")
  assert.match(src, /options\?\.scope === "all" \? "all" : "tip"/)
  assert.match(src, /publishedVersionId/)
})

test("spendFromBurstsJson prefers budget then media+fee", () => {
  assert.equal(spendFromBurstsJson([{ budget: 100 }, { budget: "50.5" }]), 150.5)
  assert.equal(spendFromBurstsJson([{ media: 80, fee: 20 }]), 100)
  assert.equal(spendFromBurstsJson([{ budget: 10, media: 999 }]), 10)
})

test("buildLineItemSnapshotParityReport flags MBA row and spend deltas", () => {
  const xano = [
    item({
      line_item_id: "a",
      mba_number: "jayco",
      bursts_json: [{ budget: 100 }],
      xano_row_id: 1,
    }),
    item({
      line_item_id: "b",
      mba_number: "jayco",
      bursts_json: [{ budget: 50 }],
      xano_row_id: 2,
    }),
    item({
      line_item_id: "c",
      mba_number: "bic",
      bursts_json: [{ budget: 10 }],
      xano_row_id: 3,
    }),
  ]
  const pg = [
    item({
      line_item_id: "a",
      mba_number: "jayco",
      bursts_json: [{ budget: 100 }],
      xano_row_id: 10,
    }),
    item({
      line_item_id: "b",
      mba_number: "jayco",
      bursts_json: [{ budget: 60 }],
      xano_row_id: 11,
    }),
    item({
      line_item_id: "d",
      mba_number: "other",
      bursts_json: [{ budget: 5 }],
      xano_row_id: 12,
    }),
  ]

  const report = buildLineItemSnapshotParityReport(xano, pg)
  assert.equal(report.xano_deduped, 3)
  assert.equal(report.pg_deduped, 3)
  assert.ok(report.mba_mismatches >= 2)

  const jayco = report.mismatched.find((r) => r.mba_number === "jayco")
  assert.ok(jayco)
  assert.equal(jayco!.row_delta, 0)
  assert.equal(jayco!.spend_delta, 10)

  const bic = report.mismatched.find((r) => r.mba_number === "bic")
  assert.ok(bic)
  assert.equal(bic!.pg_rows, 0)
  assert.equal(bic!.row_delta, -1)
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

test("filterXanoItemsToPublishedTips keeps tip FK / version_number only", () => {
  const tips: PublishedTipPointer[] = [
    {
      mba_number: "krusty010",
      master_id: 1,
      published_version_id: 1049,
      version_number: 2,
      published_campaign_status: "booked",
    },
  ]
  const items = [
    item({
      line_item_id: "tip-fk",
      mba_number: "krusty010",
      media_plan_version_id: 1049,
      version_number: 2,
    }),
    item({
      line_item_id: "old-fk",
      mba_number: "krusty010",
      media_plan_version_id: 900,
      version_number: 1,
    }),
    item({
      line_item_id: "tip-vn-fallback",
      mba_number: "krusty010",
      media_plan_version_id: 2, // Root-Cause-C: version number in FK field
      version_number: 2,
    }),
    item({
      line_item_id: "other-mba",
      mba_number: "orphan",
      media_plan_version_id: 1049,
      version_number: 2,
    }),
  ]
  const { items: kept, stats } = filterXanoItemsToPublishedTips(items, tips)
  assert.equal(kept.length, 2)
  assert.deepEqual(
    kept.map((i) => i.line_item_id).sort(),
    ["tip-fk", "tip-vn-fallback"]
  )
  assert.equal(stats.dropped_no_tip_master, 1)
  assert.equal(stats.dropped_version_mismatch, 1)
})
