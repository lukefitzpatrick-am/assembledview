import assert from "node:assert/strict"
import test from "node:test"
import { PLANNING_CHANNEL_BENCH_VERSION } from "../planningChannelBench.js"
import { UNMAPPED_MP_KEY } from "../mapEngineSplitToCreateTargets.js"
import { buildRecommendedSplitV1 } from "../recommendedSplit.js"

test("buildRecommendedSplitV1 freezes create_targets and reconciles to budget", () => {
  const snap = buildRecommendedSplitV1({
    allocated: [
      { engineChannelId: "facebook", pct: 40, dollars: 40_000 },
      { engineChannelId: "instagram", pct: 60, dollars: 60_000 },
      { engineChannelId: "digital_other", pct: 0, dollars: 0 },
    ],
    budget: 100_000,
    benchVersion: PLANNING_CHANNEL_BENCH_VERSION,
    now: new Date("2026-07-17T00:00:00.000Z"),
  })

  assert.equal(snap.version, 1)
  assert.equal(snap.frozen_at, "2026-07-17T00:00:00.000Z")
  assert.equal(snap.bench_version, PLANNING_CHANNEL_BENCH_VERSION)
  assert.equal(snap.budget, 100_000)
  assert.equal(snap.campaign_budget, 100_000)
  assert.ok(snap.create_targets.length > 0)
  assert.equal(
    snap.create_targets.reduce((s, t) => s + t.dollars, 0),
    snap.campaign_budget
  )
  assert.ok(snap.create_targets.some((t) => t.mp_key === "mp_socialmedia"))
  assert.equal(snap.channels.length, 3)
})

test("buildRecommendedSplitV1 maps digital_other to unmapped create target", () => {
  const snap = buildRecommendedSplitV1({
    allocated: [
      { engineChannelId: "tv", pct: 50, dollars: 50_000 },
      { engineChannelId: "digital_other", pct: 50, dollars: 50_000 },
    ],
    budget: 100_000,
    benchVersion: "assembled-seed-v1",
  })
  assert.ok(
    snap.create_targets.some(
      (t) => t.mp_key === UNMAPPED_MP_KEY && t.dollars === 50_000
    )
  )
})
