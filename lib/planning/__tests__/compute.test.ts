import assert from "node:assert/strict"
import test from "node:test"
import {
  affinityIndex,
  computeAudienceResponse,
  countSuppressedCells,
  reachPct,
  sumAudienceWc,
  sumUnweightedN,
} from "../compute.js"
import type { AudienceAggregateRow, PlanningChannelMeta } from "../types.js"

const bench = {
  attn: 10,
  brand_effect: 50,
  direct_effect: 40,
  cpm: 20,
}

function ch(
  over: Partial<PlanningChannelMeta> & Pick<PlanningChannelMeta, "channel_id">
): PlanningChannelMeta {
  return {
    level1: "Video",
    level2: null,
    sort_order: 1,
    is_rm_measured: true,
    age_base: 14,
    engine_channel_id: over.channel_id,
    bench,
    ...over,
  }
}

function agg(
  over: Partial<AudienceAggregateRow> & Pick<AudienceAggregateRow, "channel_id">
): AudienceAggregateRow {
  return {
    selection_wc: 0,
    selection_null_count: 0,
    selection_unweighted: 0,
    base_wc: 0,
    selection_wc_addressable: 0,
    selection_wc_total: 0,
    base_wc_addressable: 0,
    base_wc_total: 0,
    ...over,
  }
}

test("sumAudienceWc reads POPULATION selection_wc only", () => {
  const rows = [
    agg({ channel_id: "tv_fta", selection_wc: 100 }),
    agg({ channel_id: "POPULATION", selection_wc: 250.5 }),
  ]
  assert.equal(sumAudienceWc(rows), 250.5)
  assert.equal(sumAudienceWc([]), 0)
})

test("sumUnweightedN reads POPULATION selection_unweighted only", () => {
  const rows = [
    agg({ channel_id: "tv_fta", selection_unweighted: 999 }),
    agg({ channel_id: "POPULATION", selection_unweighted: 142 }),
  ]
  assert.equal(sumUnweightedN(rows), 142)
  assert.equal(sumUnweightedN([]), 0)
})

test("countSuppressedCells sums null counts excluding POPULATION", () => {
  const rows = [
    agg({ channel_id: "tv_fta", selection_null_count: 2 }),
    agg({ channel_id: "youtube", selection_null_count: 3 }),
    agg({ channel_id: "POPULATION", selection_null_count: 9 }),
  ]
  assert.equal(countSuppressedCells(rows), 5)
})

test("reachPct divides reach by audience; zero audience → 0", () => {
  assert.equal(reachPct(50, 200), 0.25)
  assert.equal(reachPct(50, 0), 0)
  assert.equal(reachPct(50, -1), 0)
})

test("affinityIndex is null-safe when base reach is 0", () => {
  assert.equal(affinityIndex(0.5, 0.25), 200)
  assert.equal(affinityIndex(0.1, 0), null)
  assert.equal(affinityIndex(0.1, -0.01), null)
  assert.ok(Number.isFinite(affinityIndex(0.5, 0.25)!))
})

test("computeAudienceResponse: affinity maths + age/gender fit = 1", () => {
  // selection: audience 1000, tv reach 200 → 20%
  // base: audience 5000, tv reach 500 → 10% → affinity 200
  const aggregates = [
    agg({
      channel_id: "POPULATION",
      selection_wc: 1000,
      selection_unweighted: 318,
      base_wc: 5000,
    }),
    agg({
      channel_id: "tv_fta",
      selection_wc: 200,
      base_wc: 500,
      selection_null_count: 1,
    }),
  ]
  const channels = [ch({ channel_id: "tv_fta", engine_channel_id: "tv" })]

  const out = computeAudienceResponse({
    wave_id: "MAR26E1_ASM",
    segment_id: "metro",
    reach_basis: "addressable",
    aggregates,
    channels,
  })

  assert.equal(out.wave_id, "MAR26E1_ASM")
  assert.equal(out.reach_basis, "addressable")
  assert.equal(out.audience_wc, 1000)
  assert.equal(out.unweighted_n, 318)
  assert.equal(out.universe_wc, 5000)
  assert.equal(out.suppressed_cells, 1)
  assert.equal(out.channels.length, 1)

  const tv = out.channels[0]
  assert.equal(tv.channel_id, "tv_fta")
  assert.equal(tv.engine_channel_id, "tv")
  assert.equal(tv.reach_wc, 200)
  assert.equal(tv.reach_pct, 0.2)
  assert.equal(tv.affinity_by_segment.metro, 200)
  assert.equal(tv.age_fit, 1.0)
  assert.equal(tv.gender_fit, 1.0)
  assert.equal(tv.age_base, 14)
  assert.equal(tv.is_rm_measured, true)
})

test("computeAudienceResponse: base reach 0 → affinity null (never Infinity)", () => {
  const aggregates = [
    agg({ channel_id: "POPULATION", selection_wc: 100, base_wc: 100 }),
    agg({ channel_id: "niche", selection_wc: 10, base_wc: 0 }),
  ]
  const out = computeAudienceResponse({
    wave_id: "W",
    segment_id: "metro",
    reach_basis: "total",
    aggregates,
    channels: [ch({ channel_id: "niche" })],
  })
  assert.equal(out.channels[0].affinity_by_segment.metro, null)
  assert.equal(out.channels[0].reach_pct, 0.1)
})

test("computeAudienceResponse: non-RM channels get neutral affinity 100", () => {
  const aggregates = [
    agg({ channel_id: "POPULATION", selection_wc: 100, base_wc: 100 }),
    agg({ channel_id: "search", selection_wc: 0, base_wc: 0 }),
  ]
  const out = computeAudienceResponse({
    wave_id: "W",
    segment_id: "base",
    reach_basis: "addressable",
    aggregates,
    channels: [ch({ channel_id: "search", is_rm_measured: false, engine_channel_id: "search" })],
  })
  assert.equal(out.channels[0].affinity_by_segment.base, 100)
  assert.equal(out.channels[0].is_rm_measured, false)
})

test("computeAudienceResponse: POPULATION excluded from channels array", () => {
  const aggregates = [
    agg({ channel_id: "POPULATION", selection_wc: 50, base_wc: 50 }),
  ]
  const out = computeAudienceResponse({
    wave_id: "W",
    segment_id: "base",
    reach_basis: "addressable",
    aggregates,
    channels: [ch({ channel_id: "POPULATION", engine_channel_id: "population" })],
  })
  assert.equal(out.audience_wc, 50)
  assert.equal(out.channels.length, 0)
})
