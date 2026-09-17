import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { CampaignPacingRow } from "../../portfolio/types.js"
import { suggestedNextStep } from "../suggestedNextStep.js"

function row(overrides: Partial<CampaignPacingRow> = {}): CampaignPacingRow {
  return {
    mbaNumber: "jayco001",
    versionNumber: 1,
    clientName: "Jayco",
    clientSlug: "jayco",
    campaignName: "Jayco AU",
    status: "booked",
    startDate: "2026-07-01",
    endDate: "2026-12-31",
    daysElapsed: 77,
    daysTotal: 184,
    daysLeft: 107,
    timePct: 42,
    budget: 50_000,
    spendToDate: 15_000,
    expectedToDate: 20_000,
    spendPct: 75,
    pace: "behind",
    projectedFinish: 40_000,
    spendYesterday: 400,
    dailyRateActual: 200,
    dailyRatePlan: 270,
    kpi: { tracked: 2, total: 2 },
    moneyAtRisk: 0,
    why: "Search is behind time.",
    channels: [
      {
        channelKey: "search",
        label: "Search · Google",
        spendToDate: 15_000,
        budget: 50_000,
        expectedToDate: 20_000,
        spendPct: 75,
        pace: "behind",
        spendMode: "actual",
        deliverable: null,
        sourceState: "reporting",
        lineItemIds: ["jayco001se1"],
      },
    ],
    ...overrides,
  }
}

describe("suggestedNextStep", () => {
  it("names the behind channel", () => {
    assert.match(suggestedNextStep(row()), /Search · Google/)
  })

  it("holds when on track", () => {
    assert.match(suggestedNextStep(row({ pace: "on_track" })), /no intervention/i)
  })
})
