import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { toCents } from "@/lib/money/cents"

import { mapPgLineItemToSnapshot, type PgLineRowMapped } from "../pgLineItemSnapshotMap"

const here = dirname(fileURLToPath(import.meta.url))

function row(overrides: Partial<PgLineRowMapped> & Pick<PgLineRowMapped, "channel" | "buyType">): PgLineRowMapped {
  return {
    id: 1,
    createdAt: "2026-07-01T00:00:00.000Z",
    lineItemId: "line-1",
    platform: null,
    publisher: null,
    bidStrategy: null,
    fixedCostMedia: false,
    noAdserving: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    feePct: 0,
    asOfDate: "2026-07-07",
    bursts: [{ budget: 1000, startDate: "2026-07-01", endDate: "2026-07-07" }],
    mbaNumber: "golf025",
    ...overrides,
  }
}

test("radio paid is assume-spend and carries daily cents", () => {
  const mapped = mapPgLineItemToSnapshot(
    row({ channel: "radio", buyType: "spots", lineItemId: "golf025ra1" }),
  )
  assert.ok(mapped)
  assert.equal(mapped.source_table, "media_plan_radio")
  assert.equal(mapped.no_adserving, false)
  assert.equal(mapped.assume_spend, true)
  const bursts = mapped.bursts_json as Array<{ assumedDailyCents: Array<{ date: string; cents: number }> }>
  assert.equal(bursts[0].assumedDailyCents[0].cents, 14286)
  assert.equal(bursts[0].assumedDailyCents[0].date, "2026-07-01")
  assert.equal(
    bursts[0].assumedDailyCents.reduce((sum, day) => sum + day.cents, 0),
    toCents(1000),
  )
})

test("radio bonus is not assume-spend", () => {
  const mapped = mapPgLineItemToSnapshot(
    row({ channel: "radio", buyType: "bonus", lineItemId: "golf025ra-bonus" }),
  )
  assert.ok(mapped)
  assert.equal(mapped.assume_spend, false)
  const bursts = mapped.bursts_json as Array<{ assumedDailyCents: unknown[] }>
  assert.deepEqual(bursts[0].assumedDailyCents, [])
})

test("DV360 with a map row is not assume-spend", () => {
  const mapped = mapPgLineItemToSnapshot(
    row({
      channel: "prog_video",
      buyType: "cpm",
      platform: "DV360",
      noAdserving: true,
      lineItemId: "golf025pv1",
    }),
  )
  assert.ok(mapped)
  assert.equal(mapped.source_table, "media_plan_prog_video")
  assert.equal(mapped.assume_spend, false)
})

test("CM360 display with no_adserving false is not assume-spend", () => {
  const mapped = mapPgLineItemToSnapshot(
    row({
      channel: "digi_display",
      buyType: "cpm",
      platform: "CM360",
      noAdserving: false,
      lineItemId: "golf025dd1",
    }),
  )
  assert.ok(mapped)
  assert.equal(mapped.no_adserving, false)
  assert.equal(mapped.assume_spend, false)
})

test("a digital line with no map and no_adserving is assume-spend", () => {
  const mapped = mapPgLineItemToSnapshot(
    row({
      channel: "digi_display",
      buyType: "cpm",
      platform: "Unmapped local site",
      noAdserving: true,
      lineItemId: "golf025dd-nosource",
    }),
  )
  assert.ok(mapped)
  assert.equal(mapped.assume_spend, true)
  assert.equal(mapped.no_adserving, true)
})

test("the snapshot SQL adds the two booleans and the merge writes them", () => {
  const ddl = readFileSync(
    join(here, "../../../sql/snowflake/mart/tables/xano_line_items_snapshot.sql"),
    "utf8",
  )
  assert.match(ddl, /ALTER TABLE ASSEMBLEDVIEW\.MART\.XANO_LINE_ITEMS_SNAPSHOT/i)
  assert.match(ddl, /ADD COLUMN IF NOT EXISTS NO_ADSERVING BOOLEAN/i)
  assert.match(ddl, /ADD COLUMN IF NOT EXISTS ASSUME_SPEND BOOLEAN/i)
  assert.doesNotMatch(ddl, /RENAME/i)

  const merge = readFileSync(join(here, "../syncXanoLineItems.ts"), "utf8")
  assert.match(merge, /NO_ADSERVING/)
  assert.match(merge, /ASSUME_SPEND/)
})
