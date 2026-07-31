import assert from "node:assert/strict"
import test from "node:test"

import {
  campaignPacingVerdict,
  campaignPacingVerdictSentence,
} from "../campaignPacingVerdict.js"

test("campaign pacing verdict uses pacingStatus bands (on track)", () => {
  // Mid-flight, spend ≈ linear expected → on_track → "On track"
  const resolved = campaignPacingVerdict({
    budget: 100_000,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    spendToDate: 50_000,
    asOfDate: "2026-01-16",
  })
  assert.ok(resolved)
  assert.equal(resolved!.status, "on-track")
  assert.match(campaignPacingVerdictSentence(resolved!), /on track/i)
})

test("no delivery after 2 days → behind via pacingStatus", () => {
  const resolved = campaignPacingVerdict({
    budget: 100_000,
    startDate: "2026-01-01",
    endDate: "2026-03-31",
    spendToDate: 0,
    asOfDate: "2026-01-05",
  })
  assert.ok(resolved)
  assert.equal(resolved!.status, "behind")
})

test("missing budget returns null (no invented verdict)", () => {
  assert.equal(
    campaignPacingVerdict({
      budget: 0,
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      spendToDate: 10,
      asOfDate: "2026-01-10",
    }),
    null,
  )
})
