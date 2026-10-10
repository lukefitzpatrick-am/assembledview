import assert from "node:assert/strict"
import test from "node:test"

import { computeCampaignDays, computeDaysPassed, computeExpectedPct } from "@/lib/pacing/maths"
import {
  dayBeforeISO,
  expectedMediaForReportWindow,
} from "@/lib/reports/campaignReport/expectedMedia"
import { resolveCampaignReportPeriod } from "@/lib/reports/campaignReport/periods"
import { resolveCampaignExpectedSpendToDate } from "@/lib/spend/resolveCampaignExpectedSpend"
import { resolveMonthlySpendForPlan } from "@/lib/spend/monthlyPlanCalendar"

/**
 * BICAU002 v28 shape: flight 1 Aug–25 Oct 2026, September heavier than a flat
 * share of the flight. Media only. Fees sit on the rows so an all-in read
 * would be a different number.
 */
const deliverySchedule = [
  {
    month: "August 2026",
    mediaCosts: { social: "$27,749.73" },
    mediaTotal: "$27,749.73",
    feeTotal: "$2,387.83",
    totalAmount: "$30,137.56",
  },
  {
    month: "September 2026",
    mediaCosts: { social: "$30,770.40", "digital video": "$16,094.12" },
    mediaTotal: "$46,864.52",
    feeTotal: "$2,769.53",
    totalAmount: "$49,634.05",
  },
  {
    month: "October 2026",
    mediaCosts: { social: "$25,641.97", "digital video": "$2,145.88" },
    mediaTotal: "$27,787.85",
    feeTotal: "$2,440.54",
    totalAmount: "$30,228.39",
  },
]

const campaignStartISO = "2026-08-01"
const campaignEndISO = "2026-10-25"

function scheduleInput() {
  return {
    billingSchedule: [],
    deliverySchedule,
    monthlySpend: resolveMonthlySpendForPlan(undefined, undefined, deliverySchedule),
    campaignStartISO,
    campaignEndISO,
  }
}

function resolverAt(asOfISO: string): number {
  return resolveCampaignExpectedSpendToDate({
    ...scheduleInput(),
    basis: "media",
    monthlyOpts: {
      campaignStartISO,
      campaignEndISO,
      asOfISO,
      basis: "media",
    },
  })
}

test("BICAU002 campaign to date matches the shared resolver, not a flat flight share", () => {
  const period = resolveCampaignReportPeriod({
    kind: "campaign_to_date",
    campaignStartISO,
    campaignEndISO,
    todayISO: "2026-10-10",
  })
  const deck = expectedMediaForReportWindow({
    ...scheduleInput(),
    windowStartISO: period.current.startISO,
    windowEndISO: period.current.endISO,
    periodSlice: false,
  })
  const resolver = resolverAt(period.current.endISO)
  assert.equal(period.current.endISO, "2026-10-10")
  assert.equal(deck, resolver)
  assert.equal(deck, 85729.39)

  const plannedMedia = 27749.73 + 46864.52 + 27787.85
  const flat = plannedMedia * computeExpectedPct(
    computeDaysPassed(campaignStartISO, campaignEndISO, "2026-10-10"),
    computeCampaignDays(campaignStartISO, campaignEndISO),
  )
  assert.ok(Math.abs(deck - flat) > 1000)
})

test("this month is the resolver at the period end minus the day before the period start", () => {
  const period = resolveCampaignReportPeriod({
    kind: "this_month",
    campaignStartISO,
    campaignEndISO,
    todayISO: "2026-10-10",
  })
  const deck = expectedMediaForReportWindow({
    ...scheduleInput(),
    windowStartISO: period.current.startISO,
    windowEndISO: period.current.endISO,
    periodSlice: true,
  })
  const atEnd = resolverAt(period.current.endISO)
  const before = resolverAt(dayBeforeISO(period.current.startISO))
  assert.equal(period.current.startISO, "2026-10-01")
  assert.equal(period.current.endISO, "2026-10-10")
  assert.equal(dayBeforeISO(period.current.startISO), "2026-09-30")
  assert.equal(deck, atEnd - before)
  assert.ok(deck < atEnd)
  assert.ok(before > 0)
})
