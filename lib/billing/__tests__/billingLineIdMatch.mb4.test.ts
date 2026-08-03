/**
 * MB-4 — schedule rows carry `billing-progBvod::X` while callers pass bare `X`.
 * Prebill on/off, inline cell edit, and rebalance must all resolve the line.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { applyScheduleLineAmountEdit } from "../applyScheduleLineAmountEdit.js"
import {
  collectLineMonthPairs,
  rebalanceLineOnSchedule,
} from "../rebalanceLineOnSchedule.js"
import type { BillingMonth } from "../types.js"
import {
  applyLinePrebillToMonths,
  restoreLinePrebillSnapshot,
} from "../../finance/manualBillingOverridesUi.js"

const DECORATED = "billing-progBvod::X"
const BARE = "X"

function fixtureMonths(): BillingMonth[] {
  const line = {
    id: DECORATED,
    header1: "BVOD",
    header2: "Prog",
    monthlyAmounts: { "June 2026": 6000, "July 2026": 4000 },
    totalAmount: 10_000,
    billingMode: "auto" as const,
  }
  return [
    {
      monthYear: "June 2026",
      mediaCosts: { progBvod: "$6,000.00" } as BillingMonth["mediaCosts"],
      mediaTotal: "$6,000.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      totalAmount: "$6,000.00",
      lineItems: { progBvod: [{ ...line, monthlyAmounts: { ...line.monthlyAmounts } }] },
    },
    {
      monthYear: "July 2026",
      mediaCosts: { progBvod: "$4,000.00" } as BillingMonth["mediaCosts"],
      mediaTotal: "$4,000.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      totalAmount: "$4,000.00",
      lineItems: { progBvod: [{ ...line, monthlyAmounts: { ...line.monthlyAmounts } }] },
    },
  ]
}

test("MB-4 prebill ON: bare caller id updates decorated schedule rows", () => {
  const months = fixtureMonths()
  for (const m of months) {
    const li = m.lineItems!.progBvod![0]!
    li.preBillSnapshot = { ...(li.monthlyAmounts ?? {}) }
  }

  applyLinePrebillToMonths(months, "progBvod", BARE, 10_000)

  const june = months[0]!.lineItems!.progBvod![0]!
  assert.equal(june.id, DECORATED)
  assert.equal(june.monthlyAmounts["June 2026"], 10_000)
  assert.equal(june.monthlyAmounts["July 2026"], 0)
  assert.equal(june.preBill, true)
})

test("MB-4 prebill OFF: bare caller restores snapshot on decorated rows", () => {
  const months = fixtureMonths()
  const snapshot = { "June 2026": 6000, "July 2026": 4000 }
  for (const m of months) {
    const li = m.lineItems!.progBvod![0]!
    li.preBillSnapshot = { ...snapshot }
    li.monthlyAmounts = { "June 2026": 10_000, "July 2026": 0 }
    li.preBill = true
  }

  assert.equal(restoreLinePrebillSnapshot(months, "progBvod", BARE), true)

  const june = months[0]!.lineItems!.progBvod![0]!
  assert.equal(june.monthlyAmounts["June 2026"], 6000)
  assert.equal(june.monthlyAmounts["July 2026"], 4000)
  assert.equal(june.preBill, false)
  assert.equal(june.preBillSnapshot, undefined)
})

test("MB-4 prebill OFF: strict-id miss would no-op — match path must not", () => {
  const months = fixtureMonths()
  const li0 = months[0]!.lineItems!.progBvod![0]!
  li0.preBillSnapshot = { "June 2026": 6000, "July 2026": 4000 }
  li0.monthlyAmounts = { "June 2026": 10_000, "July 2026": 0 }
  li0.preBill = true
  // Simulate the old bug: find by === never finds decorated vs bare
  const miss = months[0]!.lineItems!.progBvod!.find((li) => li.id === BARE)
  assert.equal(miss, undefined)
  assert.equal(restoreLinePrebillSnapshot(months, "progBvod", BARE), true)
})

test("MB-4 inline cell edit: bare caller edits decorated schedule line", () => {
  const months = fixtureMonths()
  const next = applyScheduleLineAmountEdit(months, {
    lineItemId: BARE,
    monthYear: "July 2026",
    amount: 2500,
  })
  assert.ok(next)
  const july = next![1]!.lineItems!.progBvod![0]!
  assert.equal(july.id, DECORATED)
  assert.equal(july.monthlyAmounts["July 2026"], 2500)
  assert.equal(july.billingMode, "manual")
})

test("MB-4 rebalance: bare caller finds decorated line and balances", () => {
  const months = fixtureMonths()
  // After a typed edit that left residue: June 7000 + July 2000 = 9000 vs total 10000
  months[0]!.lineItems!.progBvod![0]!.monthlyAmounts = {
    "June 2026": 7000,
    "July 2026": 2000,
  }
  months[1]!.lineItems!.progBvod![0]!.monthlyAmounts = {
    "June 2026": 7000,
    "July 2026": 2000,
  }

  const pairsBefore = collectLineMonthPairs(months, BARE)
  assert.equal(pairsBefore.length, 2)
  assert.equal(pairsBefore[0]!.amount, 7000)

  const next = rebalanceLineOnSchedule({
    months,
    lineItemId: BARE,
    lineTotal: 10_000,
    balancingMonth: "July 2026",
  })
  const pairs = collectLineMonthPairs(next, BARE)
  const sum = pairs.reduce((s, p) => s + p.amount, 0)
  assert.equal(sum, 10_000)
  assert.equal(pairs.find((p) => p.month === "July 2026")?.amount, 3000)
})
