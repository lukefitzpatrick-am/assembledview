import assert from "node:assert/strict"
import { test } from "node:test"

import {
  buildDigestCampaignRows,
  metricsForSourceRow,
  pillToDigestBand,
  type DigestSourceRow,
} from "../banding"
import { buildPacingDigestSubject } from "../email"

function baseRow(overrides: Partial<DigestSourceRow> = {}): DigestSourceRow {
  return {
    channel: "search",
    mbaNumber: "MBA001",
    clientName: "Acme",
    campaignName: "Brand Always On",
    campaignStatus: "live",
    lineItemId: "acme001SE1",
    lineItemStatus: "on-track",
    totalLineItemBudget: 1000,
    spendToDateLineTotal: 500,
    spendToDateCurrentBurst: 500,
    burstDaysRemaining: 10,
    lineItemStartDate: "2026-07-01",
    lineItemEndDate: "2026-07-20",
    currentBurst: {
      startDate: "2026-07-01",
      endDate: "2026-07-20",
      budget: 1000,
    },
    ...overrides,
  }
}

test("pillToDigestBand maps behind → at-risk", () => {
  assert.equal(pillToDigestBand("behind"), "at-risk")
  assert.equal(pillToDigestBand("ahead"), "ahead")
  assert.equal(pillToDigestBand("on-track"), "on")
  assert.equal(pillToDigestBand("no-data"), "no-data")
})

test("metricsForSourceRow delivered and elapsed", () => {
  const m = metricsForSourceRow(baseRow(), "2026-07-11")
  assert.ok(m.deliveredPct != null)
  assert.equal(Number(m.deliveredPct!.toFixed(2)), 0.5)
  assert.ok(m.timeElapsedPct != null)
  assert.ok(m.timeElapsedPct! > 0 && m.timeElapsedPct! <= 1)
  assert.equal(m.daysLeft, 10)
})

test("buildDigestCampaignRows rolls up and sorts at-risk first", () => {
  const rows = buildDigestCampaignRows(
    [
      baseRow({ lineItemStatus: "on-track", lineItemId: "a" }),
      baseRow({
        lineItemStatus: "behind",
        lineItemId: "b",
        campaignName: "Risk Campaign",
        mbaNumber: "MBA002",
      }),
      baseRow({
        lineItemStatus: "ahead",
        lineItemId: "c",
        campaignName: "Fast",
        mbaNumber: "MBA003",
      }),
    ],
    "2026-07-11",
  )
  assert.equal(rows[0].band, "at-risk")
  assert.equal(rows[0].campaignName, "Risk Campaign")
})

test("digest subject includes at-risk count", () => {
  const subject = buildPacingDigestSubject({
    asOfDate: "2026-07-11",
    builtAt: "2026-07-11T00:00:00.000Z",
    cacheNote: "",
    rows: [],
    atRisk: [],
    groups: { "at-risk": [], behind: [], on: [], ahead: [], "no-data": [] },
    counts: { atRisk: 3, behind: 0, on: 5, ahead: 2, noData: 1, total: 11 },
  })
  assert.equal(subject, "Pacing digest — 3 at risk, 5 on track, 2 ahead (11 live)")
})
