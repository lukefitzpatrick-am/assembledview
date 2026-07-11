import assert from "node:assert/strict"
import test from "node:test"
import {
  allocate,
  computeBcs,
} from "../../../app/tools/behavioural-planner/lib/bcs-engine.js"
import type {
  Channel,
  PlannerInputs,
} from "../../../app/tools/behavioural-planner/lib/types.js"
import { deriveBcsParams } from "../../../components/planning/store.js"
import {
  CODE_ENGINE_PARAMS,
  resolveEngineParams,
} from "../engineParams.js"

const channels: Channel[] = [
  {
    id: "tv",
    name: "Broadcast TV",
    attn: 8,
    B: 70,
    D: 40,
    cpm: 25,
    color: "var(--channel-tv)",
    aff: { metro: 110 },
    ageMod: 1,
    genderMod: 1,
    reachPct: 0.42,
    reachWc: 210,
    isRmMeasured: true,
    ageBase: 14,
  },
  {
    id: "bvod",
    name: "BVOD",
    attn: 6,
    B: 65,
    D: 55,
    cpm: 32,
    color: "var(--channel-bvod)",
    aff: { metro: 125 },
    ageMod: 1,
    genderMod: 1,
    reachPct: 0.28,
    reachWc: 140,
    isRmMeasured: true,
    ageBase: 14,
  },
  {
    id: "social",
    name: "Social",
    attn: 2.5,
    B: 45,
    D: 70,
    cpm: 12,
    color: "var(--channel-social)",
    aff: { metro: 95 },
    ageMod: 1,
    genderMod: 1,
    reachPct: 0.55,
    reachWc: 275,
    isRmMeasured: true,
    ageBase: 18,
  },
]

const inputs: PlannerInputs = {
  objective: 45,
  segments: ["metro"],
  weights: { A: 30, T: 25, E: 30, C: 15 },
  flight: "q3-2026",
  budget: 850_000,
  ageMin: 25,
  ageMax: 49,
  gender: "all",
  geos: ["nsw", "vic"],
}

function snapshot(
  scored: ReturnType<typeof computeBcs>,
  allocated: ReturnType<typeof allocate>
) {
  return {
    scored: scored.map((s) => ({
      id: s.ch.id,
      A: s.A,
      T: s.T,
      E: s.E,
      C: s.C,
      bcs: s.bcs,
    })),
    allocated: allocated.map((a) => ({
      id: a.ch.id,
      pct: a.pct,
      dollars: a.dollars,
    })),
  }
}

test("resolveEngineParams falls back to code defaults when meta absent", () => {
  const resolved = resolveEngineParams(undefined)
  assert.deepEqual(resolved, { ...CODE_ENGINE_PARAMS })
})

test("params-present (seed values) === params-absent scored output", () => {
  const absent = CODE_ENGINE_PARAMS
  const present = resolveEngineParams({ ...CODE_ENGINE_PARAMS })

  const scoredAbsent = computeBcs(inputs, channels, absent)
  const scoredPresent = computeBcs(inputs, channels, present)
  const allocAbsent = allocate(scoredAbsent, inputs.budget, absent)
  const allocPresent = allocate(scoredPresent, inputs.budget, present)

  assert.deepEqual(
    snapshot(scoredPresent, allocPresent),
    snapshot(scoredAbsent, allocAbsent)
  )
})

test("deriveBcsParams with seed params matches code-default nudges", () => {
  const diagnosis = {
    penetration: 30,
    target: 50,
    salience: "high" as const,
    createCapture: 70,
    weights: { A: 30, T: 25, E: 30, C: 15 },
  }
  const withCode = deriveBcsParams(diagnosis)
  const withSeed = deriveBcsParams(diagnosis, resolveEngineParams({ ...CODE_ENGINE_PARAMS }))
  assert.deepEqual(withSeed, withCode)
})
