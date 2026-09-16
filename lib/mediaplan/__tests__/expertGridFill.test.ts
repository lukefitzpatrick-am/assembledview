/**
 * ExpertGrid Excel-style fill-down (double-click all-below + drag N).
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  applyExpertFillDown,
  applyExpertWeekSpanFill,
  type ExpertFillColumn,
} from "@/lib/mediaplan/expertGridFill"
import { normalizeOptionPaste } from "@/lib/mediaplan/expertGridChannelConfig"
import type { ExpertGridRowWithWeekly } from "@/lib/mediaplan/expertGridShared"

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

test("unit-rate fill copies the stored raw value, not a currency string", () => {
  type RateRow = { id: string; unitRate: number | string }
  const unitRateCol: ExpertFillColumn = { key: "unitRate", kind: "unit-rate" }
  const rows: RateRow[] = [
    { id: "1", unitRate: 12.5 },
    { id: "2", unitRate: "" },
  ]
  const next = applyExpertFillDown({
    rows,
    sourceRowIndex: 0,
    column: unitRateCol,
    range: { mode: "all-below" },
  })
  assert.ok(next)
  assert.equal(next![1].unitRate, 12.5)
  assert.equal(String(next![1].unitRate).includes("$"), false)
})

const FILL_WEEK_KEYS = [
  "2026-01-05",
  "2026-01-12",
  "2026-01-19",
  "2026-01-26",
  "2026-02-02",
  "2026-02-09",
  "2026-02-16",
  "2026-02-23",
  "2026-03-02",
] as const

function fillWeekRow(
  spans: NonNullable<ExpertGridRowWithWeekly["mergedWeekSpans"]>
): ExpertGridRowWithWeekly {
  const weeklyValues: ExpertGridRowWithWeekly["weeklyValues"] = {}
  for (const k of FILL_WEEK_KEYS) weeklyValues[k] = ""
  return { weeklyValues, mergedWeekSpans: spans }
}

test("fill-from-anchor copies whole span widths until the drag end", () => {
  const rows = [
    fillWeekRow([
      {
        id: "src",
        startWeekKey: "2026-01-05",
        endWeekKey: "2026-01-19",
        totalQty: 42,
      },
    ]),
  ]
  const next = applyExpertWeekSpanFill({
    rows,
    weekKeys: FILL_WEEK_KEYS,
    sourceRowIndex: 0,
    sourceStartWeekKey: "2026-01-05",
    sourceEndWeekKey: "2026-01-19",
    dragEndWeekKey: "2026-03-02",
  })
  assert.ok(next)
  const spans = next![0]!.mergedWeekSpans ?? []
  assert.equal(spans.length, 3)
  assert.equal(spans[0]!.id, "src")
  assert.equal(spans[1]!.startWeekKey, "2026-01-26")
  assert.equal(spans[1]!.endWeekKey, "2026-02-09")
  assert.equal(spans[1]!.totalQty, 42)
  assert.equal(spans[2]!.startWeekKey, "2026-02-16")
  assert.equal(spans[2]!.endWeekKey, "2026-03-02")
  assert.equal(spans[2]!.totalQty, 42)
})

test("fill-from-anchor partial remainder gets no span and no value", () => {
  const rows = [
    fillWeekRow([
      {
        id: "src",
        startWeekKey: "2026-01-05",
        endWeekKey: "2026-01-19",
        totalQty: 42,
      },
      {
        id: "block",
        startWeekKey: "2026-02-16",
        endWeekKey: "2026-02-23",
        totalQty: 7,
      },
    ]),
  ]
  const next = applyExpertWeekSpanFill({
    rows,
    weekKeys: FILL_WEEK_KEYS,
    sourceRowIndex: 0,
    sourceStartWeekKey: "2026-01-05",
    sourceEndWeekKey: "2026-01-19",
    dragEndWeekKey: "2026-02-23",
  })
  assert.ok(next)
  const spans = next![0]!.mergedWeekSpans ?? []
  assert.equal(spans.length, 2)
  assert.equal(spans[0]!.id, "src")
  assert.equal(spans[1]!.startWeekKey, "2026-01-26")
  assert.equal(spans[1]!.endWeekKey, "2026-02-09")
  assert.equal(spans[1]!.totalQty, 42)
  assert.equal(
    spans.some((s) => s.id === "block"),
    false,
    "existing dest span in the fill range is dissolved"
  )
  assert.equal(next![0]!.weeklyValues["2026-02-16"], "")
  assert.equal(next![0]!.weeklyValues["2026-02-23"], "")
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
