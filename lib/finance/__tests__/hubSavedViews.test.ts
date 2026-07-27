import assert from "node:assert/strict"
import test from "node:test"

import { normalizeSavedReportConfig } from "../hubSavedViews.js"

test("normalizeSavedReportConfig accepts a valid report block", () => {
  const report = normalizeSavedReportConfig({
    groupBy: ["mediaType", "billingAgency", "not-a-dim"],
    metrics: ["totalBillable", "gst", "nope"],
    showDetailRows: true,
  })
  assert.ok(report)
  assert.deepEqual(report.groupBy, ["mediaType", "billingAgency"])
  assert.deepEqual(report.metrics, ["totalBillable", "gst"])
  assert.equal(report.showDetailRows, true)
})

test("normalizeSavedReportConfig returns undefined for missing/invalid blocks", () => {
  assert.equal(normalizeSavedReportConfig(undefined), undefined)
  assert.equal(normalizeSavedReportConfig(null), undefined)
  assert.equal(normalizeSavedReportConfig("x"), undefined)
})

test("normalizeSavedReportConfig defaults empty metrics and coerces detail flag", () => {
  const report = normalizeSavedReportConfig({
    groupBy: [],
    metrics: [],
    showDetailRows: "yes",
  })
  assert.ok(report)
  assert.deepEqual(report.groupBy, [])
  assert.deepEqual(report.metrics, ["totalBillable", "mediaSpend", "agencyFee"])
  assert.equal(report.showDetailRows, false)
})
