import assert from "node:assert/strict"
import test from "node:test"

import {
  chartExportFilename,
  normalizeChartExportSeries,
  slugifyChartExportPart,
} from "../chartExport"

test("slugifyChartExportPart strips punctuation and collapses spaces", () => {
  assert.equal(slugifyChartExportPart("Billing vs delivery by month"), "billing-vs-delivery-by-month")
  assert.equal(slugifyChartExportPart("  Reach × Index  "), "reach-index")
})

test("chartExportFilename uses page-title-yyyymmdd", () => {
  const name = chartExportFilename(
    "Finance",
    "Billing vs delivery by month",
    "csv",
    new Date(2026, 7, 2) // Aug 2 local
  )
  assert.equal(name, "finance-billing-vs-delivery-by-month-20260802.csv")
})

test("normalizeChartExportSeries: wide data → x + series columns, raw numbers", () => {
  const normalized = normalizeChartExportSeries({
    data: [
      { month: "2026-07", Billing: 1200.5, Delivery: 1100 },
      { month: "2026-08", Billing: 900, Delivery: 950.25 },
    ],
    xKey: "month",
    seriesKeys: ["Billing", "Delivery"],
  })
  assert.ok(normalized)
  assert.deepEqual(normalized!.columns, ["month", "Billing", "Delivery"])
  assert.equal(normalized!.rows[0]!.Billing, 1200.5)
  assert.equal(normalized!.rows[1]!.Delivery, 950.25)
})

test("normalizeChartExportSeries: donut label/value shape", () => {
  const normalized = normalizeChartExportSeries({
    data: [
      { label: "Search", value: 40000 },
      { label: "Social", value: 25000 },
    ],
    xKey: "label",
    seriesKeys: ["value"],
  })
  assert.ok(normalized)
  assert.deepEqual(normalized!.columns, ["label", "value"])
  assert.equal(normalized!.rows[0]!.value, 40000)
})

test("normalizeChartExportSeries: pre-shaped rows + columns", () => {
  const normalized = normalizeChartExportSeries({
    rows: [
      { week: "01 Jul", actual: 10, target: 12 },
      { week: "08 Jul", actual: 20, target: 24 },
    ],
    columns: ["week", "actual", "target"],
  })
  assert.ok(normalized)
  assert.equal(normalized!.rows.length, 2)
  assert.deepEqual(normalized!.columns, ["week", "actual", "target"])
})

test("normalizeChartExportSeries: empty → null", () => {
  assert.equal(normalizeChartExportSeries({ data: [], xKey: "x", seriesKeys: ["a"] }), null)
  assert.equal(normalizeChartExportSeries({}), null)
})
