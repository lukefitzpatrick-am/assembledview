/**
 * expectedSpendToDateFromDeliveryScheduleMonthly must understand both
 * deliverySchedule shapes. Month buckets from the delivery schedule are already
 * day-prorated, so the calendar must not scale them a second time.
 */
import assert from "node:assert/strict"
import test from "node:test"

import {
  expectedSpendToDateFromDeliveryScheduleMonthly,
  monthlySpendArrayFromDeliverySchedule,
  totalPlannedSpendFromDeliveryScheduleMonthly,
} from "../monthlyPlanCalendar"

function rowTotal(rows: ReturnType<typeof monthlySpendArrayFromDeliverySchedule>): number {
  return rows[0].data.reduce((sum, d) => sum + d.amount, 0)
}

test("counts costs-shape mediaCosts media", () => {
  const rows = monthlySpendArrayFromDeliverySchedule([
    {
      month: "August 2025",
      mediaCosts: { television: "$2,000.00", bvod: "$500.00" },
      mediaTotal: "$2,500.00",
      feeTotal: "$300.00",
      totalAmount: "$2,800.00",
    },
  ])
  assert.equal(rows.length, 1)
  const byType = Object.fromEntries(rows[0].data.map((d) => [d.mediaType, d.amount]))
  assert.equal(byType.Television, 2000)
  assert.equal(byType.BVOD, 500)
  assert.equal(byType.Fees, 300)
  assert.equal(rowTotal(rows), 2800)
})

test("still counts types-shape media", () => {
  const rows = monthlySpendArrayFromDeliverySchedule([
    {
      month: "August 2025",
      mediaTypes: [{ mediaType: "Radio", lineItems: [{ amount: "$1,000.00" }] }],
    },
  ])
  assert.equal(rows.length, 1)
  const byType = Object.fromEntries(rows[0].data.map((d) => [d.mediaType, d.amount]))
  assert.equal(byType.Radio, 1000)
})

test("does not double-count mediaCosts.production against the top-level production fee", () => {
  const rows = monthlySpendArrayFromDeliverySchedule([
    {
      month: "August 2025",
      mediaCosts: { television: "$500.00", production: "$100.00" },
      mediaTotal: "$500.00",
      feeTotal: "$0.00",
      production: "$100.00",
      totalAmount: "$600.00",
    },
  ])
  assert.equal(rowTotal(rows), 600)
})

test("includes costs-shape media for a fully elapsed campaign month", () => {
  const expected = expectedSpendToDateFromDeliveryScheduleMonthly(
    [
      {
        month: "January 2020",
        mediaCosts: { television: "$1,000.00" },
        mediaTotal: "$1,000.00",
        feeTotal: "$0.00",
        totalAmount: "$1,000.00",
      },
    ],
    {
      campaignStartISO: "2020-01-01",
      campaignEndISO: "2020-01-31",
      asOfISO: "2020-02-01",
    },
  )
  assert.equal(expected, 1000)
})

const flight = [
  { month: "January 2026", mediaCosts: { search: "$15,000.00" } },
  { month: "February 2026", mediaCosts: { search: "$28,000.00" } },
  { month: "March 2026", mediaCosts: { search: "$31,000.00" } },
]
const flightOpts = {
  campaignStartISO: "2026-01-17",
  campaignEndISO: "2026-03-31",
}

test("$74,000 mid-month flight plans to 74,000", () => {
  assert.equal(
    totalPlannedSpendFromDeliveryScheduleMonthly(flight, flightOpts),
    74000,
  )
})

test("expected on 20 Jan is four of the fifteen January campaign days", () => {
  assert.equal(
    expectedSpendToDateFromDeliveryScheduleMonthly(flight, {
      ...flightOpts,
      asOfISO: "2026-01-20",
    }),
    4000,
  )
})

test("expected on 10 Feb includes January plus ten of twenty-eight February days", () => {
  assert.equal(
    expectedSpendToDateFromDeliveryScheduleMonthly(flight, {
      ...flightOpts,
      asOfISO: "2026-02-10",
    }),
    25000,
  )
})

test("expected on the campaign end is the full plan", () => {
  assert.equal(
    expectedSpendToDateFromDeliveryScheduleMonthly(flight, {
      ...flightOpts,
      asOfISO: "2026-03-31",
    }),
    74000,
  )
})

test("expected before the campaign starts is zero", () => {
  assert.equal(
    expectedSpendToDateFromDeliveryScheduleMonthly(flight, {
      ...flightOpts,
      asOfISO: "2026-01-16",
    }),
    0,
  )
})

test("a zero bucket adds nothing", () => {
  const expected = expectedSpendToDateFromDeliveryScheduleMonthly(
    [
      { month: "January 2026", mediaCosts: { search: "$0.00" } },
      { month: "February 2026", mediaCosts: { search: "$28,000.00" } },
    ],
    { ...flightOpts, asOfISO: "2026-01-20" },
  )
  assert.equal(expected, 0)
})

test("April DST change still counts inclusive civil days", () => {
  const schedule = [{ month: "April 2026", mediaCosts: { search: "$200.00" } }]
  const opts = {
    campaignStartISO: "2026-04-05",
    campaignEndISO: "2026-04-06",
  }
  assert.equal(totalPlannedSpendFromDeliveryScheduleMonthly(schedule, opts), 200)
  assert.equal(
    expectedSpendToDateFromDeliveryScheduleMonthly(schedule, {
      ...opts,
      asOfISO: "2026-04-05",
    }),
    100,
  )
  assert.equal(
    expectedSpendToDateFromDeliveryScheduleMonthly(schedule, {
      ...opts,
      asOfISO: "2026-04-06",
    }),
    200,
  )
})
