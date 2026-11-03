/**
 * B23fix (B23 review finding 2): the nightly sync names FIXED_COST_FROM and
 * FIXED_COST_BURSTS_JSON only when the snapshot has them, so Snowflake part A
 * can run any time before `fixed_cost_report_net`. Without the columns every
 * statement is the pre-B23 text; with them the MERGE always names both, so a
 * switch turned off writes null and clears the old values.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import type { XanoLineItem } from "../../xano/fetchAllLineItems.js"
import { mockModuleSkip, supportsMockModule } from "../../test/mockModuleHarness.js"
import {
  buildSnapshotPruneMergeSql,
  buildSnapshotPruneStageCreateSql,
  buildSnapshotPruneStageInsertSql,
  snapshotHasFixedCostColumns,
} from "../xanoLineItemPruneDryRun.js"

const skip = mockModuleSkip()

type Call = { sql: string; binds: unknown[]; label?: string }
const calls: Call[] = []
let probe: "both" | "none" | "one" | "throws" = "none"

let syncLineItemsToSnowflake: typeof import("../syncXanoLineItems.js").syncLineItemsToSnowflake

if (supportsMockModule()) {
  await mock.module!("server-only", {})
  await mock.module!("@/lib/snowflake/client", {
    namedExports: {
      querySnowflake: async (sql: string, binds: unknown[] = [], options?: { label?: string }) => {
        calls.push({ sql, binds, label: options?.label })
        if (options?.label === "xano_snapshot_fixed_cost_columns") {
          if (probe === "throws") throw new Error("information_schema unavailable")
          if (probe === "both") return [{ COLUMN_NAME: "FIXED_COST_FROM" }, { COLUMN_NAME: "FIXED_COST_BURSTS_JSON" }]
          if (probe === "one") return [{ COLUMN_NAME: "FIXED_COST_FROM" }]
          return []
        }
        if (options?.label?.startsWith("xano_snapshot_prune_count_")) {
          return [{ ORPHAN_COUNT: 0, FIXED_COST_MEDIA_ORPHAN_COUNT: 0 }]
        }
        return []
      },
    },
  })
  ;({ syncLineItemsToSnowflake } = await import("../syncXanoLineItems.js"))
}

function item(id: string, extra: Partial<XanoLineItem> = {}): XanoLineItem {
  return {
    line_item_id: id,
    mba_number: "krusty001",
    line_item_name: "line",
    platform: "dv360",
    buy_type: "cpm",
    fixed_cost_media: true,
    bursts_json: [{ budget: "100" }],
    source_table: "line_items",
    xano_row_id: 1,
    xano_created_at: 2,
    no_adserving: null,
    assume_spend: null,
    ...extra,
  } as XanoLineItem
}

const valued = item("krusty001pd2", {
  fixed_cost_from: "2026-10-15",
  fixed_cost_bursts_json: [{ index: 0, startDay: "2026-10-01", endDay: "2026-10-31", netMediaCents: 100 }],
} as Partial<XanoLineItem>)

async function run(p: typeof probe, items: XanoLineItem[], mode = "off") {
  calls.length = 0
  probe = p
  process.env.SNAPSHOT_PRUNE_MODE = mode
  try {
    return await syncLineItemsToSnowflake(items, true)
  } finally {
    delete process.env.SNAPSHOT_PRUNE_MODE
  }
}

const writes = () => calls.filter((c) => c.label !== "xano_snapshot_fixed_cost_columns")

test("columns missing: the pre-B23 MERGE (12 binds a row, no new column named)", { skip }, async () => {
  const result = await run("none", [item("krusty001pd1")])
  const merge = writes().find((c) => c.sql.includes("MERGE INTO"))!
  assert.equal(merge.binds.length, 12)
  assert.doesNotMatch(merge.sql, /FIXED_COST_FROM|FIXED_COST_BURSTS_JSON/)
  assert.match(merge.sql, /column12::BOOLEAN AS ASSUME_SPEND\n\s+FROM VALUES/)
  assert.match(merge.sql, /NO_ADSERVING, ASSUME_SPEND, SYNCED_AT/)
  assert.deepEqual(result.errors, [])
  assert.equal(result.succeeded, 1)
})

test("only one column present counts as missing", { skip }, async () => {
  await run("one", [item("krusty001pd1")])
  assert.equal(writes().find((c) => c.sql.includes("MERGE INTO"))!.binds.length, 12)
})

test("columns present: both named, null while the switches are off (clears old values)", { skip }, async () => {
  await run("both", [item("krusty001pd1")])
  const merge = writes().find((c) => c.sql.includes("MERGE INTO"))!
  assert.equal(merge.binds.length, 14)
  assert.deepEqual(merge.binds.slice(12), [null, null])
  assert.match(merge.sql, /FIXED_COST_BURSTS_JSON = s\.FIXED_COST_BURSTS_JSON/)
})

test("columns missing but rows carry values: an error to run part A; the sync goes on in the old shape", { skip }, async () => {
  const result = await run("none", [item("krusty001pd1"), valued])
  const merge = writes().find((c) => c.sql.includes("MERGE INTO"))!
  assert.equal(merge.binds.length, 24)
  assert.equal(result.succeeded, 2)
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0]!, /run Snowflake part A/)
})

test("probe fails: name the columns only when a row carries a value", { skip }, async () => {
  await run("throws", [item("krusty001pd1")])
  assert.equal(writes().find((c) => c.sql.includes("MERGE INTO"))!.binds.length, 12)
  await run("throws", [item("krusty001pd1"), valued])
  const merge = writes().find((c) => c.sql.includes("MERGE INTO"))!
  assert.equal(merge.binds.length, 28)
  assert.equal(merge.binds[26], "2026-10-15")
})

test("active prune: stage and merge follow the same shape", { skip }, async () => {
  await run("none", [item("krusty001pd1")], "active")
  const stage = writes().find((c) => c.label === "xano_snapshot_prune_stage_create")!
  assert.doesNotMatch(stage.sql, /FIXED_COST_FROM/)
  const insert = writes().find((c) => c.label?.startsWith("xano_snapshot_prune_stage_insert_"))!
  assert.equal(insert.binds.length, 12)
  assert.doesNotMatch(writes().find((c) => c.label === "xano_snapshot_prune_merge")!.sql, /FIXED_COST_FROM/)

  await run("both", [item("krusty001pd1")], "active")
  assert.match(writes().find((c) => c.label === "xano_snapshot_prune_stage_create")!.sql, /FIXED_COST_BURSTS_JSON VARIANT/)
  assert.equal(writes().find((c) => c.label?.startsWith("xano_snapshot_prune_stage_insert_"))!.binds.length, 14)
  assert.match(writes().find((c) => c.label === "xano_snapshot_prune_merge")!.sql, /FIXED_COST_FROM\s+= s\.FIXED_COST_FROM/)
})

test("prune builders: default names the columns; false is the pre-B23 text", () => {
  assert.equal(buildSnapshotPruneStageCreateSql("S"), buildSnapshotPruneStageCreateSql("S", true))
  assert.doesNotMatch(buildSnapshotPruneStageCreateSql("S", false), /FIXED_COST_FROM/)
  assert.match(buildSnapshotPruneStageCreateSql("S", false), /ASSUME_SPEND BOOLEAN\n\s+\)/)
  assert.match(buildSnapshotPruneStageInsertSql("S", 1, false), /\(\?, \?, \?, \?, \?, \?, PARSE_JSON\(\?\), \?, \?, \?, \?, \?\)/)
  assert.doesNotMatch(buildSnapshotPruneMergeSql("S", false), /FIXED_COST_FROM/)
})

test("snapshotHasFixedCostColumns needs both, any case", () => {
  assert.equal(snapshotHasFixedCostColumns([{ COLUMN_NAME: "FIXED_COST_FROM" }, { column_name: "fixed_cost_bursts_json" }]), true)
  assert.equal(snapshotHasFixedCostColumns([{ COLUMN_NAME: "FIXED_COST_FROM" }]), false)
  assert.equal(snapshotHasFixedCostColumns([]), false)
})
