/**
 * B2-1 — CSV shape round-trip for three representative surfaces
 * (dashboard donut, finance grouped bars, pacing band).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { chartExportFilename, normalizeChartExportSeries } from "../chartExport"

function toCsv(
  rows: Record<string, unknown>[],
  columns: string[]
): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join(
    "\n"
  )
}

test("dashboard donut CSV headers + raw values (Excel-ready)", () => {
  const normalized = normalizeChartExportSeries({
    data: [
      { label: "Search", value: 40000 },
      { label: "Social", value: 25000.5 },
    ],
    xKey: "label",
    seriesKeys: ["value"],
  })
  assert.ok(normalized)
  const csv = toCsv(normalized!.rows, normalized!.columns)
  assert.equal(
    chartExportFilename("dashboard", "Planned media by type", "csv", new Date(2026, 7, 2)),
    "dashboard-planned-media-by-type-20260802.csv"
  )
  assert.equal(csv.split("\n")[0], "label,value")
  assert.ok(csv.includes("Search,40000"))
  assert.ok(csv.includes("Social,25000.5"))
  // Not display-formatted
  assert.ok(!csv.includes("$"))
})

test("finance grouped-bar CSV headers + raw dollars", () => {
  const normalized = normalizeChartExportSeries({
    data: [
      { month: "2026-07", Billing: 1200.5, Delivery: 1100 },
      { month: "2026-08", Billing: 900, Delivery: 950.25 },
    ],
    xKey: "month",
    seriesKeys: ["Billing", "Delivery"],
  })
  assert.ok(normalized)
  const csv = toCsv(normalized!.rows, normalized!.columns)
  assert.equal(csv.split("\n")[0], "month,Billing,Delivery")
  assert.ok(csv.includes("2026-07,1200.5,1100"))
  assert.equal(
    chartExportFilename("finance", "Billing vs delivery by month", "csv", new Date(2026, 7, 2)),
    "finance-billing-vs-delivery-by-month-20260802.csv"
  )
})

test("pacing band CSV headers + raw envelope series", () => {
  const normalized = normalizeChartExportSeries({
    rows: [
      {
        week: "01 Jul",
        date: "2026-07-01",
        actual: 12.5,
        target: 15,
        bandLow: 10,
        bandHigh: 20,
      },
    ],
    columns: ["week", "date", "actual", "target", "bandLow", "bandHigh"],
  })
  assert.ok(normalized)
  const csv = toCsv(normalized!.rows, normalized!.columns)
  assert.equal(csv.split("\n")[0], "week,date,actual,target,bandLow,bandHigh")
  assert.ok(csv.includes("01 Jul,2026-07-01,12.5,15,10,20"))
  assert.equal(
    chartExportFilename("pacing", "Cumulative impressions", "csv", new Date(2026, 7, 2)),
    "pacing-cumulative-impressions-20260802.csv"
  )
})
