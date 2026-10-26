import assert from "node:assert/strict"
import test from "node:test"
import { scopeBreakdownCheck } from "../scopeBreakdownCheck.js"

const months2026 = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`)
const goGolferTaskLines = months2026.map((m) => ({
  expense_category: "Retainer",
  description: `Monthly e-commerce retainer - ${m}`,
  cost: 4500,
}))

test("scopeBreakdownCheck: Go Golfer today ($54,000 lines vs $48,500 schedule) warns with both totals", () => {
  const r = scopeBreakdownCheck({
    cost: goGolferTaskLines,
    billing_schedule: months2026.map((month, i) => ({ month, cost: i === 0 ? 4500 : 4000 })),
  })
  assert.equal(r.costTotal, 54000)
  assert.equal(r.scheduleTotal, 48500)
  assert.equal(r.difference, 5500)
  assert.equal(r.matches, false)
  assert.match(r.warning ?? "", /\$54,000\.00/)
  assert.match(r.warning ?? "", /\$48,500\.00/)
})

test("scopeBreakdownCheck: Go Golfer after every month is $4,500 passes", () => {
  const r = scopeBreakdownCheck({
    cost: goGolferTaskLines,
    billing_schedule: months2026.map((month) => ({ month, cost: 4500 })),
  })
  assert.equal(r.matches, true)
  assert.equal(r.warning, null)
})

test("scopeBreakdownCheck: accepts JSON strings and string amounts from the form", () => {
  const r = scopeBreakdownCheck({
    cost: JSON.stringify([{ cost: "1000" }, { cost: "500.5" }]),
    billing_schedule: [{ month: "2026-10", cost: "1,500.50" }],
  })
  assert.equal(r.costTotal, 1500.5)
  assert.equal(r.scheduleTotal, 1500.5)
  assert.equal(r.matches, true)
})

test("scopeBreakdownCheck: missing or bad data totals 0 and never throws", () => {
  const r = scopeBreakdownCheck({ cost: "not json", billing_schedule: null })
  assert.equal(r.costTotal, 0)
  assert.equal(r.scheduleTotal, 0)
  assert.equal(r.matches, true)
  const r2 = scopeBreakdownCheck({ cost: [{ cost: 7000 }], billingSchedule: [{ month: "2026-05", cost: 0 }] })
  assert.equal(r2.matches, false)
  assert.equal(r2.difference, 7000)
})
