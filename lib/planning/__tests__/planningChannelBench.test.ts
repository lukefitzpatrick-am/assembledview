import assert from "node:assert/strict"
import test from "node:test"
import {
  PLANNING_CHANNEL_BENCH,
  PLANNING_CHANNEL_BENCH_VERSION,
} from "../planningChannelBench.js"

test("PLANNING_CHANNEL_BENCH rows have per-pillar value+source", () => {
  assert.ok(PLANNING_CHANNEL_BENCH_VERSION.length > 0)
  for (const [id, row] of Object.entries(PLANNING_CHANNEL_BENCH)) {
    for (const pillar of ["attn", "brand_effect", "direct_effect", "cpm"] as const) {
      assert.ok(Number.isFinite(row[pillar].value), `${id}.${pillar}.value`)
      assert.ok(row[pillar].source.trim().length > 0, `${id}.${pillar}.source`)
    }
  }
})

test("resolved bench pillars are finite numbers (no nested-object regression)", () => {
  const row = PLANNING_CHANNEL_BENCH.tv
  const attn = row.attn.value
  const B = row.brand_effect.value
  const D = row.direct_effect.value
  const cpm = row.cpm.value
  assert.ok(Number.isFinite(attn) && Number.isFinite(B) && Number.isFinite(D) && Number.isFinite(cpm))
  assert.equal(typeof attn, "number")
})
