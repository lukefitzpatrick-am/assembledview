import assert from "node:assert/strict"
import test from "node:test"
import {
  MAPPER_CHUNK_SIZE,
  MAPPER_CHUNK_THRESHOLD,
  buildChunkedSheets,
  countGridDataRows,
  mergeMapperResults,
} from "../mapPlanWithClaude.js"
import type { DetectedSheet, MapperResult } from "../types.js"

function makeSheet(opts: {
  headerRow: number | null
  dataRows: number
  firstDataRow?: number
}): DetectedSheet {
  const header: (string | number | null)[] = ["Panel", "Market"]
  const grid: (string | number | null)[][] = []
  if (opts.headerRow != null) grid.push(header)
  for (let i = 0; i < opts.dataRows; i++) {
    grid.push([`P-${i + 1}`, "Sydney"])
  }
  const first = opts.firstDataRow ?? (opts.headerRow != null ? opts.headerRow + 1 : 1)
  return {
    sheetName: "Test",
    meta: { client: "Acme" },
    headerRow: opts.headerRow,
    lineItemColumns: [{ index: 1, letter: "A", header: "Panel" }],
    flight: { dateRow: null, columns: [], granularity: "weekly" },
    costColumns: [],
    junkColumns: [],
    dataRowRange: {
      firstDataRow: first,
      lastDataRow: first + opts.dataRows - 1,
    },
    grid,
    bonusSheets: [
      {
        sheetName: "Bonus",
        meta: {},
        headerRow: 1,
        lineItemColumns: [],
        flight: { dateRow: null, columns: [], granularity: "weekly" },
        costColumns: [],
        junkColumns: [],
        dataRowRange: { firstDataRow: 2, lastDataRow: 2 },
        grid: [["x"]],
        isBonusSheet: true,
      },
    ],
  }
}

test("countGridDataRows: excludes header when headerRow set", () => {
  const sheet = makeSheet({ headerRow: 10, dataRows: 5 })
  assert.equal(countGridDataRows(sheet), 5)
  assert.equal(sheet.grid.length, 6)
})

test("countGridDataRows: all rows are data when no header", () => {
  const sheet = makeSheet({ headerRow: null, dataRows: 7 })
  assert.equal(countGridDataRows(sheet), 7)
})

test("buildChunkedSheets: under threshold returns original sheet unchanged", () => {
  const sheet = makeSheet({ headerRow: 4, dataRows: MAPPER_CHUNK_THRESHOLD })
  const batches = buildChunkedSheets(sheet)
  assert.equal(batches.length, 1)
  assert.equal(batches[0], sheet)
})

test("buildChunkedSheets: just over threshold splits into ~MAPPER_CHUNK_SIZE batches", () => {
  const dataRows = MAPPER_CHUNK_THRESHOLD + 1
  const sheet = makeSheet({ headerRow: 19, dataRows, firstDataRow: 20 })
  const batches = buildChunkedSheets(sheet)
  assert.ok(batches.length > 1)
  assert.ok(batches[0] !== sheet)

  let totalData = 0
  for (const batch of batches) {
    assert.equal(batch.headerRow, 19)
    assert.equal(batch.meta.client, "Acme")
    assert.deepEqual(batch.lineItemColumns, sheet.lineItemColumns)
    assert.deepEqual(batch.flight, sheet.flight)
    assert.equal(batch.bonusSheets, undefined)
    // Header preserved
    assert.deepEqual(batch.grid[0], ["Panel", "Market"])
    const batchData = batch.grid.length - 1
    assert.ok(batchData <= MAPPER_CHUNK_SIZE)
    assert.ok(batchData > 0)
    totalData += batchData
  }
  assert.equal(totalData, dataRows)

  // Row order + absolute dataRowRange continuity
  assert.equal(batches[0]!.dataRowRange.firstDataRow, 20)
  assert.equal(
    batches[0]!.grid[1]![0],
    "P-1",
  )
  const last = batches[batches.length - 1]!
  assert.equal(last.grid[last.grid.length - 1]![0], `P-${dataRows}`)
})

test("buildChunkedSheets: trailing blank data rows do not create empty batches", () => {
  const sheet = makeSheet({ headerRow: 19, dataRows: 45, firstDataRow: 20 })
  // Pad like a long worksheet rowCount
  for (let i = 0; i < 80; i++) sheet.grid.push([null, null])
  assert.ok(countGridDataRows(sheet) > MAPPER_CHUNK_THRESHOLD)
  const batches = buildChunkedSheets(sheet)
  const totalData = batches.reduce((n, b) => n + (b.grid.length - 1), 0)
  assert.equal(totalData, 45)
  assert.ok(batches.every((b) => (b.grid.length - 1) <= MAPPER_CHUNK_SIZE))
})

test("buildChunkedSheets: 92 data rows → ceil(92/30) batches of size ≤30", () => {
  const sheet = makeSheet({ headerRow: 19, dataRows: 92, firstDataRow: 20 })
  const batches = buildChunkedSheets(sheet)
  assert.equal(batches.length, Math.ceil(92 / MAPPER_CHUNK_SIZE))
  for (const batch of batches) {
    assert.ok(batch.grid.length - 1 <= MAPPER_CHUNK_SIZE)
  }
  assert.equal(
    batches.reduce((n, b) => n + (b.grid.length - 1), 0),
    92,
  )
})

test("mergeMapperResults: concatenates in order and prefers earliest plan_meta fields", () => {
  const a: MapperResult = {
    plan_meta: { client: "A", campaign: "Camp" },
    line_items: [
      {
        channel: "ooh",
        fields: { placement: "1" },
        bursts: [{ startDate: "2026-01-01", endDate: "2026-01-07" }],
        confidence: 0.9,
      },
    ],
    needs_review: [{ row: 1, reason: "r1" }],
    warnings: ["w1"],
  }
  const b: MapperResult = {
    plan_meta: { client: "B", startDate: "2026-01-01" },
    line_items: [
      {
        channel: "ooh",
        fields: { placement: "2" },
        bursts: [{ startDate: "2026-02-01", endDate: "2026-02-07" }],
        confidence: 0.8,
      },
    ],
    needs_review: [{ row: 2, reason: "r2" }],
    warnings: ["w2"],
  }
  const merged = mergeMapperResults([a, b])
  assert.deepEqual(merged.plan_meta, {
    client: "A",
    campaign: "Camp",
    startDate: "2026-01-01",
  })
  assert.equal(merged.line_items.length, 2)
  assert.equal(merged.line_items[0]!.fields.placement, "1")
  assert.equal(merged.line_items[1]!.fields.placement, "2")
  assert.deepEqual(merged.needs_review, [
    { row: 1, reason: "r1" },
    { row: 2, reason: "r2" },
  ])
  assert.deepEqual(merged.warnings, ["w1", "w2"])
})

test("mergeMapperResults: single result returned as-is", () => {
  const only: MapperResult = {
    plan_meta: { client: "Solo" },
    line_items: [],
    needs_review: [],
    warnings: [],
  }
  assert.equal(mergeMapperResults([only]), only)
})
