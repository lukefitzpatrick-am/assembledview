import assert from "node:assert/strict"
import test from "node:test"

import { summarizeActuals } from "../socialChannelCompute"

function day(overrides: Partial<Parameters<typeof summarizeActuals>[0][number]> = {}) {
  return {
    date: "2026-09-01",
    spend: 100,
    impressions: 0,
    clicks: 0,
    results: 0,
    video_3s_views: 0,
    ...overrides,
  }
}

test("summarizeActuals returns null CPM/CTR/CVR when the window has no impressions", () => {
  const kpis = summarizeActuals([day({ spend: 50, impressions: 0, clicks: 0, results: 0 })])
  assert.equal(kpis.impressions, 0)
  assert.equal(kpis.cpm, null)
  assert.equal(kpis.ctr, null)
  assert.equal(kpis.cvr, null)
})

test("summarizeActuals returns null CPC / cost_per_result when clicks or results are 0", () => {
  const kpis = summarizeActuals([
    day({ spend: 80, impressions: 10_000, clicks: 0, results: 0 }),
  ])
  assert.equal(kpis.cpm, 8)
  assert.equal(kpis.ctr, 0)
  assert.equal(kpis.cvr, 0)
  assert.equal(kpis.cpc, null)
  assert.equal(kpis.cost_per_result, null)
})
