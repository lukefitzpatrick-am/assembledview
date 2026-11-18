/**
 * B59fix (review R2): expected spend from a billing schedule counts to the
 * as-of day the caller passes, like the delivery-schedule branches, and to
 * the Melbourne day only when none is passed. One test per caller shape:
 *   - portfolio rows: the P1 count-to day (Melbourne yesterday);
 *   - strip and campaign dashboard: a pacing window (`resolveCampaignExpectedSpendForWindow`);
 *   - campaign reports: a period slice (end less the day before the start).
 * All run on the server, so this file runs in UTC with the clock mocked at
 * the morning boundary, where Melbourne today is day 1 of a new month:
 *   - 30 Nov 2026 21:00Z, 1 Dec 08:00 AEDT;
 *   - 30 Jun 2026 21:00Z, 1 Jul 07:00 AEST.
 * Counted to Melbourne today the new month's day 1 would be in (3000 + 100).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { attachStripExpected } from "@/lib/delivery/attachStripExpected"
import { searchFixture } from "@/lib/pacing/channel/__tests__/fixtures"
import { assembleCampaignPacingRows } from "@/lib/pacing/portfolio/assembleCampaignPacingRows"
import { expectedMediaForReportWindow } from "@/lib/reports/campaignReport/expectedMedia"
import { calculateExpectedSpendToDateFromBillingSchedule } from "@/lib/spend/billingScheduleExpectedToDate"

const INSTANTS = [
  {
    at: "2026-11-30T21:00:00Z",
    label: "1 Dec 08:00 AEDT",
    today: "2026-12-01",
    countTo: "2026-11-30",
    midMonth: "2026-11-16",
    start: "2026-11-01",
    end: "2026-12-31",
    months: ["2026-11-01", "2026-12-01"],
  },
  {
    at: "2026-06-30T21:00:00Z",
    label: "1 Jul 07:00 AEST",
    today: "2026-07-01",
    countTo: "2026-06-30",
    midMonth: "2026-06-16",
    start: "2026-06-01",
    end: "2026-07-31",
    months: ["2026-06-01", "2026-07-01"],
  },
] as const

type Instant = (typeof INSTANTS)[number]

/** 3000 in the first (30-day) month, 3100 in the second (31 days, 100 a day). */
function schedule(i: Instant) {
  return [
    { monthYear: i.months[0], totalAmount: 3000 },
    { monthYear: i.months[1], totalAmount: 3100 },
  ]
}

function billingOnlyInputs(i: Instant) {
  return {
    billingSchedule: schedule(i),
    deliverySchedule: [],
    monthlySpend: [],
    campaignStartISO: i.start,
    campaignEndISO: i.end,
    monthlyOpts: { campaignStartISO: i.start, campaignEndISO: i.end },
  }
}

test("the process zone is UTC in this file, as on Vercel", () => {
  assert.equal(new Date(Date.UTC(2026, 11, 1)).getHours(), 0)
})

for (const i of INSTANTS) {
  test(`billing expected counts to the as-of day passed, else Melbourne today (${i.label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(i.at) })
    assert.equal(calculateExpectedSpendToDateFromBillingSchedule(schedule(i), i.start, i.end, i.countTo), 3000)
    assert.equal(calculateExpectedSpendToDateFromBillingSchedule(schedule(i), i.start, i.end), 3100)
    assert.equal(calculateExpectedSpendToDateFromBillingSchedule(schedule(i), i.start, i.end, null), 3100)
  })

  test(`portfolio row expected stops at the count-to day (${i.label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(i.at) })
    const rows = assembleCampaignPacingRows({
      asOfDate: i.today,
      countToDate: i.countTo,
      allowedClientSlugs: null,
      liveOnly: true,
      search: [
        searchFixture({
          mbaNumber: "b59fix001",
          lineItemId: "b59fix001se1",
          campaignStartDate: i.start,
          campaignEndDate: i.end,
          lineItemStartDate: i.start,
          lineItemEndDate: i.end,
          totalLineItemBudget: 6_100,
          spendToDateLineTotal: 2_000,
        }),
      ],
      social: [],
      programmatic: [],
      adServing: [],
      direct: [],
      schedulesByMba: new Map([["b59fix001", { billingSchedule: schedule(i) }]]),
    })
    const row = rows.find((r) => r.mbaNumber === "b59fix001")
    assert.ok(row)
    assert.equal(row.countToDate, i.countTo)
    assert.equal(Number(row.expectedToDate.toFixed(2)), 3000)
  })

  test(`strip and dashboard window expected is dated at both ends (${i.label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(i.at) })
    const whole = attachStripExpected({
      stripInputs: billingOnlyInputs(i),
      deliveredSpendToDate: 0,
      asOf: i.today,
      window: { startISO: i.start, endISO: i.countTo, empty: false },
    })
    assert.equal(whole.expectedSpendToDate, 3000)
    // A window from day 16: 3000 to its end less 1500 (15 of 30 days) before it.
    const late = attachStripExpected({
      stripInputs: billingOnlyInputs(i),
      deliveredSpendToDate: 0,
      asOf: i.today,
      window: { startISO: i.midMonth, endISO: i.countTo, empty: false },
    })
    assert.equal(late.expectedSpendToDate, 1500)
  })

  test(`campaign report last month is the month's billing, not 0 (${i.label})`, (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(i.at) })
    const { monthlyOpts: _unused, ...inputs } = billingOnlyInputs(i)
    const lastMonth = expectedMediaForReportWindow({
      ...inputs,
      windowStartISO: i.start,
      windowEndISO: i.countTo,
      periodSlice: true,
    })
    assert.equal(lastMonth, 3000)
  })
}
