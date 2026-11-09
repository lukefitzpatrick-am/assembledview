/**
 * B31 (FC9): `fixed_cost_margin_from_date` is a finance switch, default off,
 * toggled by admins, and counts only with `fixed_cost_from_date` and
 * `fixed_cost_report_net` on. A failed read is off.
 */
import assert from "node:assert/strict"
import { test } from "node:test"

import { featureDefinition, type FeatureKey } from "@/lib/features/registry"
import { combineFixedCostMarginFromDate } from "@/lib/finance/sections/fixedCostMargin/fromDate"
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
})

test("combine: on only when all three are on", () => {
  for (const m of [false, true]) {
    for (const d of [false, true]) {
      for (const n of [false, true]) {
        assert.equal(combineFixedCostMarginFromDate(m, d, n), m && d && n, `${m} ${d} ${n}`)
      }
    }
  }
})

test("server read: needs all three switches; reads each key once", async () => {
  for (const m of [false, true]) {
    for (const d of [false, true]) {
      for (const n of [false, true]) {
        const seen: FeatureKey[] = []
        const values: Partial<Record<FeatureKey, boolean>> = {
          fixed_cost_margin_from_date: m,
          fixed_cost_from_date: d,
          fixed_cost_report_net: n,
        }
        const on = await readFixedCostMarginFromDate(async (key) => {
          seen.push(key)
          return values[key] === true
        })
        assert.equal(on, m && d && n, `${m} ${d} ${n}`)
        assert.deepEqual(seen.sort(), ["fixed_cost_from_date", "fixed_cost_margin_from_date", "fixed_cost_report_net"])
      }
    }
  }
})

test("server read: a failed read is off", async () => {
  const warn = console.warn
  console.warn = () => {}
  try {
    const on = await readFixedCostMarginFromDate(async (key) => {
      if (key === "fixed_cost_report_net") throw new Error("db down")
      return true
    })
    assert.equal(on, false)
  } finally {
    console.warn = warn
  }
})
