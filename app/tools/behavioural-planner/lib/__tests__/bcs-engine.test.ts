import assert from "node:assert/strict"
import test from "node:test"

import { computeBcs } from "../bcs-engine.js"
import type { Channel, PlannerInputs } from "../types.js"

function ch(partial: Partial<Channel> & Pick<Channel, "id" | "aff">): Channel {
  return {
    name: partial.name ?? partial.id,
    attn: partial.attn ?? 10,
    B: partial.B ?? 50,
    D: partial.D ?? 50,
    cpm: partial.cpm ?? 20,
    color: partial.color ?? "var(--channel-search)",
    ageMod: partial.ageMod ?? 1,
    genderMod: partial.genderMod ?? 1,
    reachPct: partial.reachPct ?? 0.4,
    isRmMeasured: partial.isRmMeasured ?? true,
    ageBase: partial.ageBase ?? 14,
    ...partial,
  }
}

const inputs: PlannerInputs = {
  objective: 35,
  segments: ["metro"],
  weights: { A: 30, T: 25, E: 30, C: 15 },
  flight: "q3-2026",
  budget: 100_000,
  ageMin: 25,
  ageMax: 49,
  gender: "all",
  geos: ["au"],
}

test("null affinity is excluded from A — not invented as 100", () => {
  const channels = [
    ch({ id: "tv", aff: { metro: 120 }, reachPct: 0.5 }),
    ch({ id: "cinema", aff: { metro: null }, reachPct: 0.1 }),
  ]
  const scored = computeBcs(inputs, channels)
  const tv = scored.find((s) => s.ch.id === "tv")!
  const cinema = scored.find((s) => s.ch.id === "cinema")!
  assert.equal(tv.affNullExcluded, 0)
  assert.equal(cinema.affNullExcluded, 1)
  assert.equal(cinema.affAvg, null)
  // Inventing 100 would pull cinema toward national average; null path must not.
  assert.notEqual(cinema.affAvg, 100)
})
