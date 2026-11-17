/**
 * B31 (FC9): `fixed_cost_margin_from_date` is a finance switch, default off,
 * toggled by admins, and counts only with `fixed_cost_from_date` and
 * `fixed_cost_report_net` on (resolved by isFeatureOn, B48: see
 * requires.b48.test.ts). A failed read is off.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { featureDefinition } from "@/lib/features/registry"
import { readFixedCostMarginFromDate } from "@/lib/finance/sections/fixedCostMargin/fromDate.server"

test("registry: finance, default off, admin, requires the date and net switches", () => {
  const def = featureDefinition("fixed_cost_margin_from_date")!
  assert.ok(def)
  assert.equal(def.area, "finance")
  assert.equal(def.defaultOn, false)
  assert.equal(def.toggleRole, "admin")
  assert.equal(def.source, "switch")
  assert.equal(def.clientVisible, false)
  assert.equal(def.envName, undefined)
  assert.deepEqual(def.requires, ["fixed_cost_from_date", "fixed_cost_report_net"])
  assert.match(def.description, /Line, month and report totals don't change/)
  assert.match(def.description, /Billing, true-up, accruals and Xero never read the date \(FC3\)/)
  assert.match(def.description, /Off: the report is exactly as before/)
  // B31fix N3: the pacing-facts fallback also leaves the date's month unsplit.
  assert.match(def.description, /pacing facts \(fallback/)
})

test("server read: a failed read is off", async () => {
  const warn = console.warn
  console.warn = () => {}
  try {
    const on = await readFixedCostMarginFromDate(async () => {
      throw new Error("db down")
    })
    assert.equal(on, false)
  } finally {
    console.warn = warn
  }
})
