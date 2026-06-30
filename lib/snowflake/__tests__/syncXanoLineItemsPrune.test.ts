import assert from "node:assert/strict"
import { beforeEach, mock, test } from "node:test"
import type { XanoLineItem } from "../../xano/fetchAllLineItems.js"

await mock.module("server-only", {})

type QueryCall = {
  sql: string
  binds: unknown[]
  label?: string
}

let orphanCount = 0
const queryCalls: QueryCall[] = []
const logLines: string[] = []
const errorLines: string[] = []

const querySnowflakeMock = mock.fn(async (sql: string, binds: unknown[] = [], options?: { label?: string }) => {
  queryCalls.push({ sql, binds, label: options?.label })

  if (options?.label?.startsWith("xano_snapshot_prune_count_")) {
    return [{ ORPHAN_COUNT: orphanCount, FIXED_COST_MEDIA_ORPHAN_COUNT: 0 }]
  }

  if (options?.label?.startsWith("xano_snapshot_prune_sample_")) {
    return []
  }

  return []
})

await mock.module("@/lib/snowflake/client", {
  namedExports: {
    querySnowflake: querySnowflakeMock,
  },
})

const { syncLineItemsToSnowflake } = await import("../syncXanoLineItems.js")

function lineItem(overrides: Partial<XanoLineItem> = {}): XanoLineItem {
  return {
    line_item_id: "LI-1",
    mba_number: "MBA-1",
    line_item_name: "Line 1",
    platform: "Search",
    buy_type: "CPC",
    fixed_cost_media: false,
    bursts_json: [],
    source_table: "media_plan_search",
    xano_row_id: 1,
    xano_created_at: 1000,
    ...overrides,
  }
}

beforeEach(() => {
  orphanCount = 0
  queryCalls.length = 0
  logLines.length = 0
  errorLines.length = 0
  querySnowflakeMock.mock.resetCalls()
  process.env.SNAPSHOT_PRUNE_MODE = "dryrun"
  delete process.env.SNAPSHOT_PRUNE_MAX

  mock.method(console, "log", (...args: unknown[]) => {
    logLines.push(args.map(String).join(" "))
  })
  mock.method(console, "error", (...args: unknown[]) => {
    errorLines.push(args.map(String).join(" "))
  })
  mock.method(console, "warn", () => {})
})

test("active complete prune deletes orphans and merges staged rows when under threshold", async () => {
  process.env.SNAPSHOT_PRUNE_MODE = "active"
  process.env.SNAPSHOT_PRUNE_MAX = "5"
  orphanCount = 2

  const result = await syncLineItemsToSnowflake(
    [
      lineItem({ line_item_id: "LI-1", xano_row_id: 1, xano_created_at: 1000 }),
      lineItem({ line_item_id: "LI-1", xano_row_id: 2, xano_created_at: 2000 }),
      lineItem({ line_item_id: "LI-2", xano_row_id: 3, xano_created_at: 3000 }),
    ],
    true,
  )

  assert.equal(result.succeeded, 2)
  assert.equal(result.failed, 0)
  assert.equal(result.duplicates_collapsed, 1)
  assert.equal(queryCalls.some((call) => call.label?.startsWith("xano_snapshot_batch_merge_")), false)

  const labels = queryCalls.map((call) => call.label)
  assert.ok(labels.indexOf("xano_snapshot_prune_count_active") < labels.indexOf("xano_snapshot_prune_begin"))
  assert.ok(labels.indexOf("xano_snapshot_prune_begin") < labels.indexOf("xano_snapshot_prune_delete"))
  assert.ok(labels.indexOf("xano_snapshot_prune_delete") < labels.indexOf("xano_snapshot_prune_merge"))
  assert.ok(labels.indexOf("xano_snapshot_prune_merge") < labels.indexOf("xano_snapshot_prune_commit"))

  const deleteCall = queryCalls.find((call) => call.label === "xano_snapshot_prune_delete")
  assert.ok(deleteCall)
  assert.match(deleteCall.sql, /\bDELETE\s+FROM\s+ASSEMBLEDVIEW\.MART\.XANO_LINE_ITEMS_SNAPSHOT\b/i)
  assert.match(deleteCall.sql, /\bNOT\s+IN\b/i)

  assert.ok(logLines.some((line) => line.includes("orphans deleted=2") && line.includes("rows merged=2")))
})

test("active complete prune aborts delete over threshold and still runs merge", async () => {
  process.env.SNAPSHOT_PRUNE_MODE = "active"
  process.env.SNAPSHOT_PRUNE_MAX = "5"
  orphanCount = 6

  const result = await syncLineItemsToSnowflake([lineItem()], true)

  assert.equal(result.succeeded, 1)
  assert.equal(queryCalls.some((call) => call.label === "xano_snapshot_prune_delete"), false)
  assert.equal(queryCalls.some((call) => call.label === "xano_snapshot_prune_begin"), false)
  assert.ok(queryCalls.some((call) => call.label === "xano_snapshot_batch_merge_1"))
  assert.ok(
    errorLines.some((line) =>
      line.includes("prune aborted: orphan count 6 exceeds SNAPSHOT_PRUNE_MAX 5 — possible keep-set error"),
    ),
  )
})

test("active incomplete prune skips delete and runs merge only", async () => {
  process.env.SNAPSHOT_PRUNE_MODE = "active"
  orphanCount = 2

  const result = await syncLineItemsToSnowflake([lineItem()], false)

  assert.equal(result.succeeded, 1)
  assert.equal(queryCalls.some((call) => call.label === "xano_snapshot_prune_delete"), false)
  assert.equal(queryCalls.some((call) => call.label === "xano_snapshot_prune_count_active"), false)
  assert.ok(queryCalls.some((call) => call.label === "xano_snapshot_batch_merge_1"))
  assert.ok(logLines.some((line) => line.includes("prune skipped: incomplete fetch")))
})

test("dryrun remains log-only after merge", async () => {
  process.env.SNAPSHOT_PRUNE_MODE = "dryrun"
  orphanCount = 3

  const result = await syncLineItemsToSnowflake([lineItem()], true)

  assert.equal(result.succeeded, 1)
  assert.ok(queryCalls.some((call) => call.label === "xano_snapshot_batch_merge_1"))
  assert.ok(queryCalls.some((call) => call.label === "xano_snapshot_prune_count_dryrun"))
  assert.ok(queryCalls.some((call) => call.label === "xano_snapshot_prune_sample_dryrun"))
  assert.equal(queryCalls.some((call) => /\bDELETE\b/i.test(call.sql)), false)
  assert.ok(logLines.some((line) => line.includes("snapshot prune dryrun dry-run")))
})
