import assert from "node:assert/strict"
import test from "node:test"

import {
  indexReportedSpendByLineDate,
  overlayReportedSpendOnActuals,
} from "../applyReportedSpend"

test("indexReportedSpendByLineDate sums REPORTED_SPEND per line and day", () => {
  const byLine = indexReportedSpendByLineDate([
    { lineItemId: "bicau002pv1", dateDay: "2026-03-01", reportedSpend: 10 },
    { lineItemId: "bicau002pv1", dateDay: "2026-03-01", reportedSpend: 5 },
    { lineItemId: "bicau002pv1", dateDay: "2026-03-02", reportedSpend: 20 },
    { lineItemId: "other", dateDay: "2026-03-01", reportedSpend: 99 },
  ])
  assert.equal(byLine.get("bicau002pv1")?.get("2026-03-01"), 15)
  assert.equal(byLine.get("bicau002pv1")?.get("2026-03-02"), 20)
  assert.equal(byLine.get("other")?.get("2026-03-01"), 99)
})

test("overlayReportedSpendOnActuals replaces PACING_FACT spend with reported spend", () => {
  const days = [
    { date: "2026-03-01", spend: 0 },
    { date: "2026-03-02", spend: 0 },
    { date: "2026-03-03", spend: 12 },
  ]
  overlayReportedSpendOnActuals(days, new Map([
    ["2026-03-01", 40.5],
    ["2026-03-02", 10],
  ]))
  assert.deepEqual(days.map((d) => [d.date, d.spend]), [
    ["2026-03-01", 40.5],
    ["2026-03-02", 10],
    ["2026-03-03", 0],
  ])
})
