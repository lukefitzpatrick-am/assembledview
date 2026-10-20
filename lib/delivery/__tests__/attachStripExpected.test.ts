import assert from "node:assert/strict"
import { test } from "node:test"

import { resolveCampaignExpectedSpendToDate } from "@/lib/spend/resolveCampaignExpectedSpend"
import { resolveMonthlySpendForPlan } from "@/lib/spend/monthlyPlanCalendar"

import { attachStripExpected } from "../attachStripExpected"

test("campaign-read expected equals the strip resolver for the same inputs", () => {
  const campaignStartISO = "2026-08-01"
  const campaignEndISO = "2026-10-25"
  const deliverySchedule = [
    {
      month: "August 2026",
      mediaCosts: { social: "$20,000.00", "programmatic video": "$30,000.00" },
      mediaTotal: "$50,000.00",
      feeTotal: "$0.00",
      totalAmount: "$50,000.00",
    },
    {
      month: "September 2026",
      mediaCosts: { social: "$20,000.00", "programmatic video": "$20,000.00" },
      mediaTotal: "$40,000.00",
      feeTotal: "$0.00",
      totalAmount: "$40,000.00",
    },
    {
      month: "October 2026",
      mediaCosts: { social: "$6,201.00", "programmatic video": "$6,201.00" },
      mediaTotal: "$12,402.00",
      feeTotal: "$0.00",
      totalAmount: "$12,402.00",
    },
  ]
  const stripInputs = {
    billingSchedule: [],
    deliverySchedule,
    monthlySpend: resolveMonthlySpendForPlan(undefined, undefined, deliverySchedule),
    campaignStartISO,
    campaignEndISO,
    monthlyOpts: { campaignStartISO, campaignEndISO },
  }
  const stripExpected = resolveCampaignExpectedSpendToDate({
    ...stripInputs,
    basis: "media",
    monthlyOpts: { ...stripInputs.monthlyOpts, asOfISO: "2026-09-18", basis: "media" },
  })
  const readExpected = attachStripExpected({
    stripInputs,
    deliveredSpendToDate: 53_785,
    asOf: "2026-09-18",
  })

  assert.equal(readExpected.expectedSpendToDate, stripExpected)
  assert.ok(stripExpected > 0)
  assert.equal(readExpected.daysInCampaign, 86)
  assert.equal(readExpected.daysElapsed, 49)
})

test("a 20% fee is excluded from expected media and from behindBy", () => {
  const campaignStartISO = "2026-01-01"
  const campaignEndISO = "2026-01-31"
  const deliverySchedule = [
    {
      month: "January 2026",
      mediaCosts: { search: "$10,000.00" },
      feeTotal: "$2,000.00",
      totalAmount: "$12,000.00",
    },
  ]
  const monthlyOpts = {
    campaignStartISO,
    campaignEndISO,
    asOfISO: "2026-02-01",
  }
  const base = {
    billingSchedule: [],
    deliverySchedule,
    monthlySpend: resolveMonthlySpendForPlan(undefined, undefined, deliverySchedule),
    campaignStartISO,
    campaignEndISO,
    monthlyOpts,
  }
  assert.equal(resolveCampaignExpectedSpendToDate({ ...base, basis: "media" }), 10000)
  assert.equal(resolveCampaignExpectedSpendToDate({ ...base, basis: "all_in" }), 12000)
  const strip = attachStripExpected({
    stripInputs: base,
    deliveredSpendToDate: 8000,
    asOf: "2026-02-01",
  })
  assert.equal(strip.expectedSpendToDate, 10000)
  assert.equal(strip.behindBy, 2000)
})

test("with a pacing window, expected and days stop at the window end like the strip", async () => {
  const { resolveCampaignExpectedSpendForWindow } = await import(
    "@/lib/spend/resolveCampaignExpectedSpend"
  )
  const { resolvePacingWindowISO } = await import("@/lib/pacing/expectedForWindow")
  const campaignStartISO = "2026-08-01"
  const campaignEndISO = "2026-10-25"
  const deliverySchedule = [
    { month: "August 2026", mediaCosts: { social: "$31,000.00" }, feeTotal: "$0.00", totalAmount: "$31,000.00" },
    { month: "September 2026", mediaCosts: { social: "$30,000.00" }, feeTotal: "$0.00", totalAmount: "$30,000.00" },
    { month: "October 2026", mediaCosts: { social: "$25,000.00" }, feeTotal: "$0.00", totalAmount: "$25,000.00" },
  ]
  const stripInputs = {
    billingSchedule: [],
    deliverySchedule,
    monthlySpend: resolveMonthlySpendForPlan(undefined, undefined, deliverySchedule),
    campaignStartISO,
    campaignEndISO,
    monthlyOpts: { campaignStartISO, campaignEndISO },
  }
  // Melbourne 21 Oct 2026 morning: yesterday is 20 Oct.
  const window = resolvePacingWindowISO({
    campaignStartISO,
    campaignEndISO,
    reference: new Date("2026-10-20T22:00:00Z"),
  })
  assert.equal(window.endISO, "2026-10-20")
  const stripExpected = resolveCampaignExpectedSpendForWindow({
    ...stripInputs,
    basis: "media",
    monthlyOpts: { ...stripInputs.monthlyOpts, basis: "media" },
    window,
  })
  const read = attachStripExpected({
    stripInputs,
    deliveredSpendToDate: 70_000,
    asOf: "2026-10-21",
    window,
  })
  assert.equal(read.expectedSpendToDate, stripExpected)
  assert.equal(read.daysElapsed, 81)
  assert.equal(read.daysInCampaign, 86)
  // Today is not counted: the to-date figure as at today is larger.
  const asAtToday = attachStripExpected({ stripInputs, deliveredSpendToDate: 70_000, asOf: "2026-10-21" })
  assert.ok(asAtToday.expectedSpendToDate > read.expectedSpendToDate)
})

test("a filtered window expects only the filtered days", async () => {
  const { resolvePacingWindowISO } = await import("@/lib/pacing/expectedForWindow")
  const campaignStartISO = "2026-09-01"
  const campaignEndISO = "2026-09-30"
  const deliverySchedule = [
    { month: "September 2026", mediaCosts: { search: "$30,000.00" }, feeTotal: "$0.00", totalAmount: "$30,000.00" },
  ]
  const stripInputs = {
    billingSchedule: [],
    deliverySchedule,
    monthlySpend: resolveMonthlySpendForPlan(undefined, undefined, deliverySchedule),
    campaignStartISO,
    campaignEndISO,
    monthlyOpts: { campaignStartISO, campaignEndISO },
  }
  const window = resolvePacingWindowISO({
    filterStartISO: "2026-09-11",
    filterEndISO: "2026-09-20",
    campaignStartISO,
    campaignEndISO,
    reference: new Date("2026-10-20T22:00:00Z"),
  })
  const read = attachStripExpected({ stripInputs, deliveredSpendToDate: 9000, asOf: "2026-10-21", window })
  assert.equal(read.expectedSpendToDate, 10000)
  assert.equal(read.behindBy, 1000)
})

test("a window that has not opened expects nothing", async () => {
  const { resolvePacingWindowISO } = await import("@/lib/pacing/expectedForWindow")
  const deliverySchedule = [
    { month: "November 2026", mediaCosts: { search: "$30,000.00" }, feeTotal: "$0.00", totalAmount: "$30,000.00" },
  ]
  const stripInputs = {
    billingSchedule: [],
    deliverySchedule,
    monthlySpend: resolveMonthlySpendForPlan(undefined, undefined, deliverySchedule),
    campaignStartISO: "2026-11-01",
    campaignEndISO: "2026-11-30",
    monthlyOpts: { campaignStartISO: "2026-11-01", campaignEndISO: "2026-11-30" },
  }
  const window = resolvePacingWindowISO({
    campaignStartISO: "2026-11-01",
    campaignEndISO: "2026-11-30",
    reference: new Date("2026-10-20T22:00:00Z"),
  })
  assert.equal(window.empty, true)
  const read = attachStripExpected({ stripInputs, deliveredSpendToDate: 0, asOf: "2026-10-21", window })
  assert.equal(read.expectedSpendToDate, 0)
  assert.equal(read.daysElapsed, 0)
})
