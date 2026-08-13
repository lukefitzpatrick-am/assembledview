import assert from "node:assert/strict"
import test from "node:test"

import { buildCampaignSummaryRowProps } from "../campaignSummaryRowProps"

const TIME = {
  timeElapsedPct: 40,
  daysInCampaign: 100,
  daysElapsed: 40,
  daysRemaining: 60,
}

const FULL = {
  isUnfiltered: true,
  budget: 50_000,
  actualSpend: 12_000,
  expectedSpend: 15_000,
  totalPlannedSpend: 50_000,
  deliveredImpressions: 800_000,
  hasDelivery: true,
  deliveredAsOf: "2026-06-01",
  time: TIME,
  axisStartYmd: "2026-01-01",
  axisEndYmd: "2026-12-31",
} as const

test("unfiltered summary-row props keep full-campaign spend and axis", () => {
  const props = buildCampaignSummaryRowProps({ ...FULL })
  assert.equal(props.spend.budget, 50_000)
  assert.equal(props.spend.actualSpend, 12_000)
  assert.equal(props.spend.expectedSpend, 15_000)
  assert.equal(props.spend.totalPlannedSpend, 50_000)
  assert.equal(props.time.startDate, "2026-01-01")
  assert.equal(props.time.endDate, "2026-12-31")
  assert.equal(props.delivered?.asOf, "2026-06-01")
})

test("filtered summary-row props change dated figures but never budget", () => {
  const unfiltered = buildCampaignSummaryRowProps({ ...FULL })
  const filtered = buildCampaignSummaryRowProps({
    ...FULL,
    isUnfiltered: false,
    actualSpend: 3_000,
    expectedSpend: 4_000,
    totalPlannedSpend: 10_000,
    deliveredImpressions: 100_000,
    deliveredAsOf: "2026-03-31",
    axisStartYmd: "2026-03-01",
    axisEndYmd: "2026-03-31",
    time: { ...TIME, daysInCampaign: 31, daysElapsed: 31, daysRemaining: 0, timeElapsedPct: 100 },
  })

  assert.deepEqual(unfiltered, buildCampaignSummaryRowProps({ ...FULL }))
  assert.equal(filtered.spend.budget, unfiltered.spend.budget)
  assert.notEqual(filtered.spend.actualSpend, unfiltered.spend.actualSpend)
  assert.notEqual(filtered.spend.expectedSpend, unfiltered.spend.expectedSpend)
  assert.notEqual(filtered.spend.totalPlannedSpend, unfiltered.spend.totalPlannedSpend)
  assert.notEqual(filtered.time.startDate, unfiltered.time.startDate)
  assert.notEqual(filtered.delivered?.asOf, unfiltered.delivered?.asOf)
  assert.equal(filtered.time.startDate, "2026-03-01")
  assert.equal(filtered.time.endDate, "2026-03-31")
})
