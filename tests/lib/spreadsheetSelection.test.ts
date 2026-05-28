import assert from "node:assert/strict"
import test from "node:test"

import { buildSpreadsheetRegistry } from "../../lib/spreadsheet/registry.js"
import {
  enumeratePasteTargets,
  mapClipboardMatrixToTargets,
  normalizeSpreadsheetRect,
  registryEntryInRect,
} from "../../lib/spreadsheet/selection.js"
import { serializeSpreadsheetCellKey } from "../../lib/spreadsheet/cellKey.js"

test("registry spans two expanded tables in screen order", () => {
  const reg = buildSpreadsheetRegistry(["Jan", "Feb"], [
    {
      tableKey: "search",
      expanded: true,
      rows: [{ rowKind: "lineItem", rowId: "a" }],
    },
    {
      tableKey: "social",
      expanded: false,
      rows: [{ rowKind: "lineItem", rowId: "b" }],
    },
    {
      tableKey: "television",
      expanded: true,
      rows: [{ rowKind: "lineItem", rowId: "c" }],
    },
  ])

  assert.equal(reg.rowCount, 2)
  assert.equal(reg.colCount, 2)
  assert.equal(reg.entries.length, 4)
  assert.equal(reg.entries[0]!.tableKey, "search")
  assert.equal(reg.entries[2]!.tableKey, "television")
})

test("rectangular selection across tables includes both rows", () => {
  const reg = buildSpreadsheetRegistry(["M1", "M2"], [
    {
      tableKey: "search",
      expanded: true,
      rows: [{ rowKind: "lineItem", rowId: "a" }],
    },
    {
      tableKey: "television",
      expanded: true,
      rows: [{ rowKind: "lineItem", rowId: "c" }],
    },
  ])

  const rect = normalizeSpreadsheetRect(0, 0, 1, 1)
  const keys = reg.entries.filter((e) => registryEntryInRect(e, rect))
  assert.equal(keys.length, 4)
})

test("paste tile repeats 1x1 pattern into 2x2 selection", () => {
  const matrix = [["5"]]
  const targets = [
    { rowIndex: 0, colIndex: 0 },
    { rowIndex: 0, colIndex: 1 },
    { rowIndex: 1, colIndex: 0 },
    { rowIndex: 1, colIndex: 1 },
  ]
  const { assignments, layout } = mapClipboardMatrixToTargets(matrix, 0, 0, targets)
  assert.equal(layout, "tile")
  assert.equal(assignments.length, 4)
  assert.ok(assignments.every((a) => a.raw === "5"))
})

test("paste clip truncates oversized clipboard", () => {
  const matrix = [
    ["1", "2"],
    ["3", "4"],
  ]
  const targets = [{ rowIndex: 0, colIndex: 0 }]
  const { assignments, layout } = mapClipboardMatrixToTargets(matrix, 0, 0, targets)
  assert.equal(layout, "clip")
  assert.equal(assignments.length, 1)
  assert.equal(assignments[0]!.raw, "1")
})

test("enumeratePasteTargets for multi-cell rect", () => {
  const reg = buildSpreadsheetRegistry(["M1", "M2"], [
    {
      tableKey: "search",
      expanded: true,
      rows: [
        { rowKind: "lineItem", rowId: "a" },
        { rowKind: "lineItem", rowId: "b" },
      ],
    },
  ])

  const rect = normalizeSpreadsheetRect(0, 0, 1, 1)
  const result = enumeratePasteTargets(
    0,
    0,
    rect,
    null,
    null,
    reg.entries,
    reg.colCount,
    (e) => serializeSpreadsheetCellKey(e)
  )
  assert.ok(result)
  assert.equal(result!.targets.length, 4)
})
