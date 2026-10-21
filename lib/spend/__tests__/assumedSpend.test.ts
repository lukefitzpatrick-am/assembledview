import assert from "node:assert/strict"
import test from "node:test"

import { toCents } from "@/lib/money/cents"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"

import {
  ASSUMED_SPEND_CAP_APPLIED,
  ASSUMED_SPEND_LABEL,
  ASSUMED_SPEND_MODE,
  assumedDailyCents,
  assumedSpendForBurst,
} from "../assumedSpend"

const WEEK = {
  startDate: "2026-07-01",
  endDate: "2026-07-07",
} as const

test("$1,000 over 7 days puts 14286 cents on day 1 and the remainder on day 7", () => {
  const days = assumedDailyCents({
    deliveryMediaCents: toCents(1000),
    ...WEEK,
    asOfDate: "2026-07-07",
  })
  assert.equal(days.length, 7)
  assert.equal(days[0].date, "2026-07-01")
  assert.equal(days[0].cents, 14286)
  assert.equal(days[5].cents, 14286)
  const remainder = toCents(1000) - 14286 * 6
  assert.equal(days[6].date, "2026-07-07")
  assert.equal(days[6].cents, remainder)
  assert.notEqual(days[6].cents, 14286)
  assert.equal(
    days.reduce((sum, day) => sum + day.cents, 0),
    toCents(1000),
  )
})

test("a mid-burst as-of does not apply the remainder", () => {
  const days = assumedDailyCents({
    deliveryMediaCents: toCents(1000),
    ...WEEK,
    asOfDate: "2026-07-03",
  })
  assert.deepEqual(
    days.map((day) => day.cents),
    [14286, 14286, 14286, 0, 0, 0, 0],
  )
  assert.equal(days[6].cents, 0)
})

test("bonus and package inclusions return nothing", () => {
  const shared = {
    rawBudget: 1000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 15,
    ...WEEK,
    asOfDate: "2026-07-07",
  }
  assert.deepEqual(assumedSpendForBurst({ ...shared, buyType: "bonus" }), [])
  assert.deepEqual(
    assumedSpendForBurst({ ...shared, buyType: "package_inclusions" }),
    [],
  )
})

test("client-pays uses delivery media, not invoiced media", () => {
  const input = {
    rawBudget: 1000,
    budgetIncludesFees: true,
    clientPaysForMedia: true,
    feePct: 15,
    buyType: "package",
  }
  const amounts = computeBurstAmounts(input)
  assert.equal(amounts.mediaAmount, 0)
  assert.ok(amounts.deliveryMediaAmount > 0)

  const days = assumedSpendForBurst({
    ...input,
    startDate: "2026-07-01",
    endDate: "2026-07-01",
    asOfDate: "2026-07-01",
  })
  assert.equal(days.length, 1)
  assert.equal(days[0].cents, toCents(amounts.deliveryMediaAmount))
})

test("panel flight dates override burst dates", () => {
  const days = assumedSpendForBurst({
    rawBudget: 1000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 0,
    buyType: "spots",
    ...WEEK,
    asOfDate: "2026-08-07",
    panelFlights: [{ startDate: "2026-08-01", endDate: "2026-08-07" }],
  })
  assert.equal(days[0].date, "2026-08-01")
  assert.equal(days[0].cents, 14286)
  assert.equal(days[6].date, "2026-08-07")
  assert.equal(days[6].cents, toCents(1000) - 14286 * 6)
  assert.equal(
    days.some((day) => day.date.startsWith("2026-07-")),
    false,
  )
})

test("the assumed-spend label is not a flat allocation", () => {
  assert.equal(ASSUMED_SPEND_LABEL, "Assumed spend")
  assert.equal(ASSUMED_SPEND_MODE, "assumed")
  assert.equal(ASSUMED_SPEND_CAP_APPLIED, "assumed_spend")
})

test("stored burst instants are Sydney civil days, not UTC slices", () => {
  // 2026-09-30T14:00:00.000Z is midnight 1 Oct AEST; 2026-10-30T13:00:00.000Z is midnight 31 Oct AEDT.
  const base = {
    rawBudget: 3100,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 0,
    buyType: "fixed_cost",
    asOfDate: "2026-10-20",
  }
  const fromInstants = assumedSpendForBurst({
    ...base,
    startDate: "2026-09-30T14:00:00.000Z",
    endDate: "2026-10-30T13:00:00.000Z",
  })
  const fromCivil = assumedSpendForBurst({ ...base, startDate: "2026-10-01", endDate: "2026-10-31" })
  assert.deepEqual(fromInstants, fromCivil)
  assert.equal(fromInstants.length, 31)
  assert.equal(fromInstants[0]?.date, "2026-10-01")
  assert.equal(fromInstants[30]?.date, "2026-10-31")
  // Through 20 Oct: 20 days at 10000 cents, nothing for 21 Oct onwards.
  assert.equal(
    fromInstants.reduce((sum, day) => sum + day.cents, 0),
    200000,
  )
})

test("panel flight instants are Sydney civil days too", () => {
  const days = assumedSpendForBurst({
    rawBudget: 700,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 0,
    buyType: "panels",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    asOfDate: "2026-12-31",
    panelFlights: [{ startDate: "2026-07-05T14:00:00.000Z", endDate: "2026-07-11T14:00:00.000Z" }],
  })
  assert.equal(days[0]?.date, "2026-07-06")
  assert.equal(days[days.length - 1]?.date, "2026-07-12")
})
