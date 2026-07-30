import assert from "node:assert/strict"
import { describe, it, beforeEach, afterEach } from "node:test"
import { getDataBackend } from "../backend"
import {
  __resetShadowDiffStoreForTests,
  compareReferenceRows,
  normalizeComparableValue,
  recordShadowDiff,
  summarizeShadowDiffs,
} from "../shadowDiff"

describe("getDataBackend", () => {
  let prev: string | undefined

  beforeEach(() => {
    prev = process.env.DATA_BACKEND
  })

  afterEach(() => {
    if (prev === undefined) delete process.env.DATA_BACKEND
    else process.env.DATA_BACKEND = prev
  })

  it("defaults to xano", () => {
    delete process.env.DATA_BACKEND
    assert.equal(getDataBackend(), "xano")
  })

  it("accepts shadow and postgres", () => {
    process.env.DATA_BACKEND = "shadow"
    assert.equal(getDataBackend(), "shadow")
    process.env.DATA_BACKEND = "POSTGRES"
    assert.equal(getDataBackend(), "postgres")
  })

  it("falls back to xano on unknown values", () => {
    process.env.DATA_BACKEND = "mysql"
    assert.equal(getDataBackend(), "xano")
  })
})

describe("normalizeComparableValue", () => {
  it("normalizes unix seconds and ISO strings to the same ISO", () => {
    const iso = "2024-01-15T00:00:00.000Z"
    const seconds = Math.floor(Date.parse(iso) / 1000)
    assert.equal(normalizeComparableValue(seconds), iso)
    assert.equal(normalizeComparableValue(iso), iso)
  })
})

describe("compareReferenceRows + shadow store", () => {
  beforeEach(() => {
    __resetShadowDiffStoreForTests()
  })

  it("detects missing ids and field mismatches", () => {
    const event = compareReferenceRows(
      "tv_stations",
      [
        { id: 1, station: "ABC", network: "Seven" },
        { id: 2, station: "OnlyXano", network: "Nine" },
      ],
      [
        { id: 1, station: "ABC", network: "Ten" },
        { id: 3, station: "OnlyPg", network: "Seven" },
      ]
    )
    assert.deepEqual(event.missingInPostgres, [2])
    assert.deepEqual(event.missingInXano, [3])
    assert.equal(event.fieldDiffs.length, 1)
    assert.equal(event.fieldDiffs[0]!.id, 1)
    assert.equal(event.fieldDiffs[0]!.fields[0]!.field, "network")
  })

  it("summarizes last-24h events by table", () => {
    const event = compareReferenceRows("radio_stations", [{ id: 1, station: "A" }], [
      { id: 1, station: "B" },
    ])
    recordShadowDiff(event)
    const summary = summarizeShadowDiffs()
    assert.equal(summary.eventCount, 1)
    assert.equal(summary.byTable.length, 1)
    assert.equal(summary.byTable[0]!.table, "radio_stations")
    assert.equal(summary.byTable[0]!.lastEvent.rowsWithFieldDiffs, 1)
  })
})
