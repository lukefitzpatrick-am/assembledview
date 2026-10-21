import assert from "node:assert/strict"
import test from "node:test"

import { summarizeDv360Actuals } from "../programmaticCompute"

test("summarizeDv360Actuals returns null CPA when the window has no results", () => {
  const kpis = summarizeDv360Actuals([
    { spend: 40, impressions: 8_000, clicks: 20, conversions: 0, videoViews: 0 },
  ])
  assert.equal(kpis.cpa, null)
  assert.equal(kpis.cpc, 2)
  assert.notEqual(kpis.cpm, null)
  assert.notEqual(kpis.ctr, null)
})

test("summarizeDv360Actuals CVR is conversions over clicks in percentage points", () => {
  const kpis = summarizeDv360Actuals([
    { spend: 40, impressions: 8_000, clicks: 20, conversions: 5, videoViews: 0 },
  ])
  assert.equal(kpis.cvr, 25)
  const noClicks = summarizeDv360Actuals([
    { spend: 40, impressions: 8_000, clicks: 0, conversions: 5, videoViews: 0 },
  ])
  assert.equal(noClicks.cvr, null)
})
