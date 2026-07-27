/**
 * ExpertGrid Excel-style fill-down (double-click all-below + drag N).
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  applyExpertFillDown,
  type ExpertFillColumn,
} from "@/lib/mediaplan/expertGridFill"
import { normalizeOptionPaste } from "@/lib/mediaplan/expertGridChannelConfig"

type Row = { id: string; creative: string; buyType: string }

const buyTypeOptions = [
  { value: "cpc", label: "Cost Per Click" },
  { value: "cpm", label: "Cost Per Mille" },
]

const textCol: ExpertFillColumn = {
  key: "creative",
  kind: "text",
}

const comboboxCol: ExpertFillColumn = {
  key: "buyType",
  kind: "combobox-static",
  normalizePaste: (raw) => normalizeOptionPaste(raw, buyTypeOptions),
}

const readOnlyCol: ExpertFillColumn = {
  key: "creative",
  kind: "text",
  readOnly: true,
}

test("text fill-down copies source value verbatim to every row below", () => {
  const rows: Row[] = [
    { id: "1", creative: "  hello  ", buyType: "" },
    { id: "2", creative: "old", buyType: "" },
    { id: "3", creative: "", buyType: "" },
  ]
  const next = applyExpertFillDown({
    rows,
    sourceRowIndex: 0,
    column: textCol,
    range: { mode: "all-below" },
  })
  assert.ok(next)
  assert.equal(next![0].creative, "  hello  ")
  assert.equal(next![1].creative, "  hello  ")
  assert.equal(next![2].creative, "  hello  ")
})

test("combobox fill-down routes writes through normalizePaste", () => {
  const rows: Row[] = [
    { id: "1", creative: "", buyType: "Cost Per Click" },
    { id: "2", creative: "", buyType: "cpm" },
    { id: "3", creative: "", buyType: "" },
  ]
  const next = applyExpertFillDown({
    rows,
    sourceRowIndex: 0,
    column: comboboxCol,
    range: { mode: "all-below" },
  })
  assert.ok(next)
  assert.equal(next![0].buyType, "Cost Per Click")
  assert.equal(next![1].buyType, "cpc")
  assert.equal(next![2].buyType, "cpc")
})

test("drag-range of N writes only the next N rows", () => {
  const rows: Row[] = [
    { id: "1", creative: "src", buyType: "" },
    { id: "2", creative: "a", buyType: "" },
    { id: "3", creative: "b", buyType: "" },
    { id: "4", creative: "c", buyType: "" },
  ]
  const next = applyExpertFillDown({
    rows,
    sourceRowIndex: 0,
    column: textCol,
    range: { mode: "drag", rowCount: 2 },
  })
  assert.ok(next)
  assert.equal(next![1].creative, "src")
  assert.equal(next![2].creative, "src")
  assert.equal(next![3].creative, "c")
})

test("read-only column is a no-op", () => {
  const rows: Row[] = [
    { id: "1", creative: "src", buyType: "" },
    { id: "2", creative: "keep", buyType: "" },
  ]
  const next = applyExpertFillDown({
    rows,
    sourceRowIndex: 0,
    column: readOnlyCol,
    range: { mode: "all-below" },
  })
  assert.equal(next, null)
})
