/**
 * B31fix L4: the day view's cost before the date can be more than the month
 * view's cost for the month (a rounding cent per source, a restatement
 * between the reads, or a duplicate label map key while the month view is
 * still FCM1). The cost before the date is capped at the month's cost, so the
 * fixed cost leg's cost is never below 0, and the legs still add to the month
 * in whole cents.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { composeFixedCostMargin, summariseFixedCostMargin, type FixedCostMarginLine } from "../compose.js"
import { preDateCostCap, splitDateMonth, type FixedCostLegAmounts } from "../fromDate.js"
import { BOSS_FROM, BOSS_RANGE, bossPlan, bossPreDateSpend, bossSpend } from "./fixtures/bossFc9.js"

const sum = (a: FixedCostLegAmounts, b: FixedCostLegAmounts) => ({
  billedCents: a.billedCents + b.billedCents,
  actualCents: a.actualCents + b.actualCents,
  marginCents: a.marginCents == null && b.marginCents == null ? null : (a.marginCents ?? 0) + (b.marginCents ?? 0),
})

function withoutFc9(lines: readonly FixedCostMarginLine[]): unknown {
  return JSON.parse(
    JSON.stringify(lines, (key, value) =>
      key === "fixedCostFrom" || key === "legs" || key === "fixedCostLegs" ? undefined : value,
    ),
  )
}

test("cap: the cost before the date is never more than the month's cost", () => {
  assert.equal(preDateCostCap(60000, 50000), 50000)
  assert.equal(preDateCostCap(40000, 50000), 40000)
  assert.equal(preDateCostCap(50000, 50000), 50000)
  assert.equal(preDateCostCap(-100, 50000), -100)
})

test("day cost above the month cost: the fixed cost leg's cost is 0, not negative", () => {
  const s = splitDateMonth({ billedCents: 100000, actualCents: 50000, marginCents: 50000 }, 60000)
  assert.deepEqual(s.before, { billedCents: 50000, actualCents: 50000, marginCents: 0 })
  assert.deepEqual(s.from, { billedCents: 50000, actualCents: 0, marginCents: 50000 })
})

test("one rounding cent over: capped at the month, legs add in whole cents", () => {
  // BOSS010PD2 October with the day sum one cent above the month view.
  const month = { billedCents: 136000, actualCents: 63988, marginCents: 72012 }
  const s = splitDateMonth(month, 63989)
  assert.deepEqual(s.before, { billedCents: 63988, actualCents: 63988, marginCents: 0 })
  assert.deepEqual(s.from, { billedCents: 72012, actualCents: 0, marginCents: 72012 })
  assert.deepEqual(sum(s.before, s.from), month)
})

test("day cost above both the month's billing and its cost (FC6 floor and the cap together)", () => {
  const s = splitDateMonth({ billedCents: 30000, actualCents: 50000, marginCents: -20000 }, 70000)
  assert.deepEqual(s.before, { billedCents: 30000, actualCents: 50000, marginCents: -20000 })
  assert.deepEqual(s.from, { billedCents: 0, actualCents: 0, marginCents: 0 })
})

test("random months: the fixed cost leg's cost is never below 0 and legs add to the month", () => {
  let seed = 185
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return (seed % (2 * n + 1)) - n
  }
  for (let i = 0; i < 3000; i += 1) {
    const billed = rnd(500000)
    const actual = Math.abs(rnd(500000))
    const pre = i % 4 === 0 ? actual + Math.abs(rnd(5000)) : Math.abs(rnd(600000))
    const margin = i % 9 === 0 ? null : billed - actual
    const s = splitDateMonth({ billedCents: billed, actualCents: actual, marginCents: margin }, pre)
    assert.ok(s.from.actualCents >= 0, `run ${i}: ${s.from.actualCents}`)
    assert.ok(s.before.actualCents <= actual)
    assert.ok(s.from.billedCents >= 0)
    assert.deepEqual(sum(s.before, s.from), { billedCents: billed, actualCents: actual, marginCents: margin })
    for (const v of [s.before.billedCents, s.from.billedCents, s.before.actualCents, s.from.actualCents]) {
      assert.ok(Number.isInteger(v))
    }
  }
})

test("BOSS, day cost above October's cost on every line: totals unchanged, no negative fixed cost leg cost", () => {
  const pre = new Map([...bossPreDateSpend().keys()].map((k) => [k, 999999]))
  const on = composeFixedCostMargin({ plan: bossPlan(BOSS_FROM), spend: bossSpend(), invoiced: new Set(), ...BOSS_RANGE, preDateSpendCents: pre })
  const off = composeFixedCostMargin({ plan: bossPlan(), spend: bossSpend(), invoiced: new Set(), ...BOSS_RANGE })
  assert.deepEqual(withoutFc9(on), withoutFc9(off))
  assert.deepEqual(summariseFixedCostMargin(on), summariseFixedCostMargin(off))
  for (const line of on) {
    const oct = line.months.find((m) => m.month === "2026-10")!
    assert.equal(oct.legs?.kind, "split")
    if (oct.legs?.kind !== "split") continue
    assert.equal(oct.legs.from.actualCents, 0, line.lineItemId)
    assert.equal(oct.legs.before.actualCents, oct.actualCents, line.lineItemId)
    assert.deepEqual(sum(oct.legs.before, oct.legs.from), {
      billedCents: oct.billedCents,
      actualCents: oct.actualCents,
      marginCents: oct.marginCents,
    })
    assert.ok(line.fixedCostLegs!.from.actualCents >= 0)
  }
})
