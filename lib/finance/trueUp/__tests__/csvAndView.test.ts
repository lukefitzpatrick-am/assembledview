import assert from "node:assert/strict"
import test from "node:test"

import { buildTrueUpReport } from "../compute.js"
import { buildTrueUpCsv, centsToPlain, trueUpCsvFilename, trueUpCsvHeader } from "../csv.js"
import { filterTrueUpRows, sydneyTodayIso, trueUpMonthOptions, trueUpRowSuggestions } from "../viewModel.js"
import { INVOICES, MATCHED_RECORDS, PLANS, SCHEDULE } from "./fixtures.js"

const report = buildTrueUpReport({
  asOfMonth: "2026-09",
  fromMonth: "2026-07",
  plans: PLANS,
  schedule: SCHEDULE,
  invoices: INVOICES,
  matchedRecords: MATCHED_RECORDS,
})

test("cents print without float maths", () => {
  assert.equal(centsToPlain(-163893), "-1638.93")
  assert.equal(centsToPlain(5), "0.05")
  assert.equal(centsToPlain(0), "0.00")
  assert.equal(centsToPlain(4878), "48.78")
})

test("CSV: month rows, a to-date row per MBA, header width on every row", () => {
  const csv = buildTrueUpCsv(report)
  const rows = csv.trim().split("\r\n")
  const width = trueUpCsvHeader().length
  for (const r of rows) assert.equal(r.split(",").length >= width, true)
  const golfToDate = rows.find((r) => r.startsWith("to date,Golf Australia,golf025"))
  assert.ok(golfToDate)
  assert.match(golfToDate!, /,-1638\.93,Gap,Spread the charge over the remaining months,/)
  assert.ok(rows.some((r) => r.startsWith("month,Golf Australia,golf025,40,2026-09,INV-1477,")))
  assert.equal(trueUpCsvFilename("2026-10"), "true-up-2026-10.csv")
})

test("view: needs action hides matches, search by client or MBA", () => {
  assert.deepEqual(
    filterTrueUpRows(report.rows, "action", "").map((r) => r.mbaNumber).sort(),
    ["BICAU006", "PGAAUS015", "golf025"],
  )
  assert.deepEqual(filterTrueUpRows(report.rows, "all", "pga").map((r) => r.mbaNumber), ["PGAAUS015"])
  const golf = report.rows.find((r) => r.mbaNumber === "golf025")!
  assert.ok(trueUpRowSuggestions(golf).includes("Fee: Spread the charge over the remaining months"))
})

test("month options: last month first, twelve of them, Sydney date", () => {
  const opts = trueUpMonthOptions("2026-11-02")
  assert.equal(opts.length, 12)
  assert.equal(opts[0], "2026-10")
  assert.equal(opts[11], "2025-11")
  assert.equal(sydneyTodayIso(new Date("2026-10-31T14:30:00Z")), "2026-11-01")
})
