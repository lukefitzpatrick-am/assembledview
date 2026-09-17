import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  JAYCO_AS_OF,
  JAYCO_LINES,
  JAYCO_META,
  JAYCO_SEARCH,
} from "@/lib/pacing/scenario/__tests__/jaycoFixture.js"
import { applyScenario } from "@/lib/pacing/scenario/applyScenario.js"
import { avaToolDefinitionsForPage } from "../pageToolOffer.js"
import { parseScenarioLeversFromPrompt, runScenarioFromLines } from "../runScenario.js"

const JAYCO_LEVERS = {
  moves: [{ from: JAYCO_SEARCH.lineItemId, to: JAYCO_META.lineItemId, amount: 8_000 }],
  caps: [{ lineItemId: JAYCO_SEARCH.lineItemId, dailyCap: 164 }],
  pauses: [] as string[],
  extendDays: 0,
  burstDateChanges: [],
}

describe("runScenarioFromLines", () => {
  it("returns the Jayco fixture result plus narrative", () => {
    const expected = applyScenario(JAYCO_LINES, JAYCO_LEVERS, JAYCO_AS_OF)
    const out = runScenarioFromLines({
      lines: JAYCO_LINES,
      asOf: JAYCO_AS_OF,
      levers: JAYCO_LEVERS,
    })
    assert.equal(out.result.campaign.budget, expected.campaign.budget)
    assert.equal(out.result.campaign.projectedFinish, expected.campaign.projectedFinish)
    const search = out.result.lines.find((line) => line.lineItemId === JAYCO_SEARCH.lineItemId)
    assert.equal(search?.perDayNeeded, 164)
    assert.equal(Math.round(search?.remaining ?? 0), 34_211)
    assert.match(out.narrative, /on budget|Projected finish/i)
    assert.equal(out.goal, null)
    assert.equal(out.plan, null)
  })
})

describe("parseScenarioLeversFromPrompt", () => {
  it("parses move 8k from search to meta and a search cap of 164", () => {
    const levers = parseScenarioLeversFromPrompt(
      "move 8k from search to meta and cap search at 164",
      JAYCO_LINES,
    )
    assert.equal(levers.moves[0]?.from, JAYCO_SEARCH.lineItemId)
    assert.equal(levers.moves[0]?.to, JAYCO_META.lineItemId)
    assert.equal(levers.moves[0]?.amount, 8_000)
    assert.equal(levers.caps[0]?.lineItemId, JAYCO_SEARCH.lineItemId)
    assert.equal(levers.caps[0]?.dailyCap, 164)
    assert.deepEqual(levers.pauses, [])
    assert.equal(levers.extendDays, 0)
  })
})

describe("run_scenario page offer", () => {
  const defs = [
    { name: "get_pacing_snapshot" },
    { name: "run_scenario" },
    { name: "accept_ingest_proposal" },
  ]

  it("offers run_scenario on /pacing and /dashboard only", () => {
    const pacing = avaToolDefinitionsForPage(defs, { route: { pathname: "/pacing/portfolio" } })
    const dash = avaToolDefinitionsForPage(defs, { route: { pathname: "/dashboard/jayco/jayco001" } })
    const plans = avaToolDefinitionsForPage(defs, { route: { pathname: "/mediaplans/create" } })
    assert.ok(pacing.some((t) => t.name === "run_scenario"))
    assert.ok(dash.some((t) => t.name === "run_scenario"))
    assert.equal(plans.some((t) => t.name === "run_scenario"), false)
  })
})
