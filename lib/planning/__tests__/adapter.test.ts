import assert from "node:assert/strict"
import test from "node:test"
import {
  adaptAudienceToEngine,
  scoreableChannels,
  type TaxonomyRow,
} from "../adapter.js"
import type { AudienceResponse, PlanningMeta } from "../types.js"

const emptyBench = {
  attn: null,
  brand_effect: null,
  direct_effect: null,
  cpm: null,
}

const meta: PlanningMeta = {
  waves: [],
  segments: [],
  states: ["NAT"],
  age_bands: ["25-34"],
  genders: ["male", "female"],
  methodology: [],
  engine_params: {},
  channels: [
    {
      channel_id: "POPULATION",
      level1: null,
      level2: null,
      sort_order: 99,
      is_rm_measured: true,
      age_base: 14,
      engine_channel_id: null,
      bench: emptyBench,
    },
    {
      channel_id: "video_total",
      level1: "Video",
      level2: "Total",
      sort_order: 1,
      is_rm_measured: true,
      age_base: 14,
      engine_channel_id: null,
      bench: emptyBench,
    },
    {
      channel_id: "tv_fta",
      level1: "Video",
      level2: "FTA",
      sort_order: 2,
      is_rm_measured: true,
      age_base: 14,
      engine_channel_id: "tv",
      bench: { attn: 18, brand_effect: 85, direct_effect: 35, cpm: 38 },
    },
    {
      channel_id: "cinema",
      level1: "Cinema",
      level2: "Cinema",
      sort_order: 50,
      is_rm_measured: true,
      age_base: 14,
      engine_channel_id: "cinema",
      bench: { attn: 28, brand_effect: 88, direct_effect: 32, cpm: 45 },
    },
  ],
}

function audience(): AudienceResponse {
  return {
    wave_id: "W",
    reach_basis: "addressable",
    audience_wc: 1000,
    unweighted_n: 200,
    universe_wc: 5000,
    suppressed_cells: 0,
    channels: [
      {
        channel_id: "video_total",
        engine_channel_id: "video_total",
        reach_wc: 800,
        reach_pct: 0.8,
        reach_pct_addressable: 0.8,
        reach_pct_total: 0.75,
        affinity_by_segment: { metro: 100 },
        age_fit: 1,
        gender_fit: 1,
        is_rm_measured: true,
        age_base: 14,
        bench: emptyBench,
      },
      {
        channel_id: "tv_fta",
        engine_channel_id: "tv",
        reach_wc: 400,
        reach_pct: 0.4,
        reach_pct_addressable: 0.4,
        reach_pct_total: 0.35,
        affinity_by_segment: { metro: 110 },
        age_fit: 1,
        gender_fit: 1,
        is_rm_measured: true,
        age_base: 14,
        bench: { attn: 18, brand_effect: 85, direct_effect: 35, cpm: 38 },
      },
      {
        channel_id: "cinema",
        engine_channel_id: "cinema",
        reach_wc: 50,
        reach_pct: 0.05,
        reach_pct_addressable: 0.05,
        reach_pct_total: 0.04,
        affinity_by_segment: { metro: 90 },
        age_fit: 1,
        gender_fit: 1,
        is_rm_measured: true,
        age_base: 14,
        bench: { attn: 28, brand_effect: 88, direct_effect: 32, cpm: 45 },
      },
    ],
  }
}

test("adaptAudienceToEngine: taxonomy carries rollups; scoreable excludes them", () => {
  const out = adaptAudienceToEngine({
    audience: audience(),
    meta,
    segmentId: "metro",
  })

  const types = out.taxonomy.map((r) => r.rowType)
  assert.ok(types.includes("rollup"))
  assert.ok(types.includes("leaf"))
  assert.ok(types.includes("injected"))

  const rollup = out.taxonomy.find((r) => r.channelId === "video_total")
  assert.equal(rollup?.rowType, "rollup")
  assert.equal(rollup?.engine, null)
  assert.equal(rollup?.reachPct, 0.8)

  assert.equal(out.channels.length, scoreableChannels(out.taxonomy).length)
  assert.ok(out.channels.every((c) => c.id !== "video_total"))
  assert.ok(out.channels.some((c) => c.id === "tv"))
  assert.ok(out.channels.some((c) => c.id === "cinema"))
  assert.ok(out.channels.some((c) => c.id === "search"))

  // POPULATION never in taxonomy
  assert.equal(
    out.taxonomy.some((r) => r.channelId === "POPULATION"),
    false
  )
})

test("scoreableChannels: skips rollups and null-engine leaves", () => {
  const rows: TaxonomyRow[] = [
    {
      rowType: "rollup",
      channelId: "video_total",
      engineChannelId: null,
      level1: "Video",
      label: "Total",
      sortOrder: 1,
      reachPct: 0.8,
      reachWc: 800,
      ageBase: 14,
      isRmMeasured: true,
      engine: null,
    },
    {
      rowType: "leaf",
      channelId: "tv_fta",
      engineChannelId: "tv",
      level1: "Video",
      label: "FTA",
      sortOrder: 2,
      reachPct: 0.4,
      reachWc: 400,
      ageBase: 14,
      isRmMeasured: true,
      engine: {
        id: "tv",
        name: "Broadcast TV",
        attn: 18,
        B: 85,
        D: 35,
        cpm: 38,
        color: "var(--channel-tv)",
        aff: { metro: 110 },
        ageMod: 1,
        genderMod: 1,
        reachPct: 0.4,
        reachWc: 400,
        reachPctAddressable: 0.4,
        reachPctTotal: 0.35,
        isRmMeasured: true,
        ageBase: 14,
      },
    },
  ]
  const scored = scoreableChannels(rows)
  assert.equal(scored.length, 1)
  assert.equal(scored[0]!.id, "tv")
})
