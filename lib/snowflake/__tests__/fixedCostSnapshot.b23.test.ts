/**
 * B23: the nightly snapshot is the single warehouse gate for fixed cost from a
 * date (FC2) and the net media basis (FC4). Switches off: the row is the same
 * object as before and the MERGE binds null into the two new columns.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import type { XanoLineItem } from "../../xano/fetchAllLineItems.js"
import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import {
  fixedCostSnapshotBursts,
  FIXED_COST_SNAPSHOT_FLAGS_OFF,
  mapPgLineItemToSnapshot,
  type PgLineRowMapped,
} from "../pgLineItemSnapshotMap"
import {
  buildSnapshotPruneMergeSql,
  buildSnapshotPruneStageCreateSql,
  buildSnapshotPruneStageInsertSql,
} from "../xanoLineItemPruneDryRun"

const skip = mockModuleSkip()

// BOSS010PD1 shape: fee-inclusive $2,125 a month at a 20% fee = $1,700 net.
const row: PgLineRowMapped = {
  id: 7,
  createdAt: "2026-10-30T00:00:00.000Z",
  lineItemId: "krusty001pd1",
  channel: "prog_display",
  platform: "DV360",
  buyType: "cpm",
  bidStrategy: null,
  fixedCostMedia: true,
  fixedCostFrom: "2026-10-15",
  budgetIncludesFees: true,
  clientPaysForMedia: false,
  feePct: 20,
  asOfDate: "2026-11-03",
  bursts: [
    { startDate: "2026-08-31T14:00:00.000Z", endDate: "2026-09-29T14:00:00.000Z", budget: "2125", calculatedValue: 170000 },
    { startDate: "2026-09-30T14:00:00.000Z", endDate: "2026-10-30T13:00:00.000Z", budget: "$2,125.00", calculatedValue: 170000 },
  ],
  mbaNumber: "KRUSTY001",
}

const ON = { fixedCostReportNet: true, fixedCostFromDate: true }

test("switches off (default and explicit): no new keys, same object as before", () => {
  const byDefault = mapPgLineItemToSnapshot(row)
  const explicit = mapPgLineItemToSnapshot(row, FIXED_COST_SNAPSHOT_FLAGS_OFF)
  assert.ok(byDefault)
  assert.equal("fixed_cost_from" in byDefault!, false)
  assert.equal("fixed_cost_bursts_json" in byDefault!, false)
  assert.deepEqual(explicit, byDefault)
})

test("net on: per-burst Melbourne days and net media cents (FC4), index aligned", () => {
  const mapped = mapPgLineItemToSnapshot(row, { fixedCostReportNet: true, fixedCostFromDate: false })
  assert.deepEqual(mapped!.fixed_cost_bursts_json, [
    { index: 0, startDay: "2026-09-01", endDay: "2026-09-30", netMediaCents: 170000 },
    { index: 1, startDay: "2026-10-01", endDay: "2026-10-31", netMediaCents: 170000 },
  ])
  // The date needs the date switch.
  assert.equal("fixed_cost_from" in mapped!, false)
  // BURSTS_JSON itself is untouched (no new burst keys).
  const stored = mapped!.bursts_json as Array<Record<string, unknown>>
  assert.equal("netMediaCents" in stored[0]!, false)
})

test("date sent only with both switches on and the line fixed cost", () => {
  assert.equal(mapPgLineItemToSnapshot(row, ON)!.fixed_cost_from, "2026-10-15")
  assert.equal(
    "fixed_cost_from" in mapPgLineItemToSnapshot(row, { fixedCostReportNet: false, fixedCostFromDate: true })!,
    false,
  )
  const notFixed = mapPgLineItemToSnapshot({ ...row, fixedCostMedia: false }, ON)!
  assert.equal("fixed_cost_from" in notFixed, false)
  assert.equal("fixed_cost_bursts_json" in notFixed, false)
  const noDate = mapPgLineItemToSnapshot({ ...row, fixedCostFrom: null }, ON)!
  assert.equal("fixed_cost_from" in noDate, false)
  assert.ok(noDate.fixed_cost_bursts_json)
})

test("net bursts: not fee inclusive keeps the budget; bonus is 0; a junk burst keeps its index", () => {
  const out = fixedCostSnapshotBursts({
    bursts: [{ budget: "1000.005", startDate: "2026-04-04T13:00:00.000Z", endDate: "2026-04-05" }, null, { budget: "50" }],
    buyType: "cpm",
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 20,
  })
  assert.deepEqual(out[0], { index: 0, startDay: "2026-04-05", endDay: "2026-04-05", netMediaCents: 100001 })
  assert.deepEqual(out[1], { index: 1, startDay: null, endDay: null, netMediaCents: 0 })
  assert.equal(out[2]!.netMediaCents, 5000)
  const bonus = fixedCostSnapshotBursts({
    bursts: [{ budget: "500" }],
    buyType: "bonus",
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 0,
  })
  assert.equal(bonus[0]!.netMediaCents, 0)
})

test("prune stage and merge carry both columns", () => {
  assert.match(buildSnapshotPruneStageCreateSql("S"), /FIXED_COST_FROM DATE,\s*FIXED_COST_BURSTS_JSON VARIANT/)
  assert.match(buildSnapshotPruneStageInsertSql("S", 1), /\?, PARSE_JSON\(\?\)\)/)
  const merge = buildSnapshotPruneMergeSql("S")
  assert.match(merge, /FIXED_COST_FROM\s+= s\.FIXED_COST_FROM/)
  assert.match(merge, /FIXED_COST_BURSTS_JSON = s\.FIXED_COST_BURSTS_JSON/)
})

const calls: Array<{ sql: string; binds: unknown[] }> = []
let syncLineItemsToSnowflake: typeof import("../syncXanoLineItems.js").syncLineItemsToSnowflake

if (supportsMockModule()) {
  await mock.module!("server-only", {})
  await mock.module!("@/lib/snowflake/client", {
    namedExports: {
      querySnowflake: async (sql: string, binds: unknown[] = []) => {
        calls.push({ sql, binds })
        return []
      },
    },
  })
  ;({ syncLineItemsToSnowflake } = await import("../syncXanoLineItems.js"))
}

test("MERGE: 14 binds a row; switch-off rows bind null for both new columns", { skip }, async () => {
  calls.length = 0
  const off = mapPgLineItemToSnapshot(row) as XanoLineItem
  const on = mapPgLineItemToSnapshot({ ...row, lineItemId: "krusty001pd2" }, ON) as XanoLineItem
  process.env.SNAPSHOT_PRUNE_MODE = "off"
  await syncLineItemsToSnowflake([off, on], false)
  const merge = calls.find((c) => c.sql.includes("MERGE INTO"))
  assert.ok(merge)
  assert.match(merge!.sql, /column13::DATE AS FIXED_COST_FROM/)
  assert.match(merge!.sql, /FIXED_COST_FROM\s+= s\.FIXED_COST_FROM/)
  assert.equal(merge!.binds.length, 28)
  const rows = [merge!.binds.slice(0, 14), merge!.binds.slice(14)]
  const offRow = rows.find((r) => r[0] === "krusty001pd1")!
  const onRow = rows.find((r) => r[0] === "krusty001pd2")!
  assert.deepEqual(offRow.slice(12), [null, null])
  assert.equal(onRow[12], "2026-10-15")
  assert.deepEqual(JSON.parse(String(onRow[13]))[1], {
    index: 1,
    startDay: "2026-10-01",
    endDay: "2026-10-31",
    netMediaCents: 170000,
  })
  delete process.env.SNAPSHOT_PRUNE_MODE
})

test("the date counts only with the net basis on (server and browser getters)", async () => {
  const { combineFixedCostFromDate, deliveryFlagsFromClient } = await import("@/lib/delivery/deliveryFlags")
  const { readDeliveryFlags } = await import("@/lib/delivery/deliveryFlags.server")
  const { setClientFeatureSnapshot } = await import("@/lib/features/client")
  assert.equal(combineFixedCostFromDate(true, true), true)
  assert.equal(combineFixedCostFromDate(true, false), false)
  assert.equal(combineFixedCostFromDate(false, true), false)
  const dateOnly = await readDeliveryFlags(async (key) => key === "fixed_cost_from_date")
  assert.equal(dateOnly.fixedCostFromDate, false)
  const both = await readDeliveryFlags(async (key) => key === "fixed_cost_from_date" || key === "fixed_cost_report_net")
  assert.deepEqual(both, { packageNoUnitTarget: false, fixedCostReportNet: true, fixedCostFromDate: true })
  setClientFeatureSnapshot({ fixed_cost_from_date: true })
  assert.equal(deliveryFlagsFromClient().fixedCostFromDate, false)
  setClientFeatureSnapshot({ fixed_cost_from_date: true, fixed_cost_report_net: true })
  assert.equal(deliveryFlagsFromClient().fixedCostFromDate, true)
  setClientFeatureSnapshot(null)
  assert.equal(deliveryFlagsFromClient().fixedCostFromDate, false)
})
