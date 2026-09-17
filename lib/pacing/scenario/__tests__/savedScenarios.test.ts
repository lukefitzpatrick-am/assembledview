import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyScenario } from "../applyScenario.js"
import { compareSavedToLive, memorySavedScenarioStore } from "../savedScenarios.js"
import { JAYCO_AS_OF, JAYCO_LINES, JAYCO_META, JAYCO_SEARCH } from "./jaycoFixture.js"

describe("saved scenario store", () => {
  it("writes and lists by mba, newest first", async () => {
    const store = memorySavedScenarioStore()
    const levers = {
      moves: [{ from: JAYCO_SEARCH.lineItemId, to: JAYCO_META.lineItemId, amount: 8_000 }],
      caps: [{ lineItemId: JAYCO_SEARCH.lineItemId, dailyCap: 164 }],
      pauses: [] as string[],
      extendDays: 0,
      burstDateChanges: [],
    }
    const result = applyScenario(JAYCO_LINES, levers, JAYCO_AS_OF)
    await store.insert({
      mbaNumber: "jayco001",
      versionNumber: 14,
      name: "Move 8k + cap",
      levers,
      result,
      createdByEmail: "luke@assembledmedia.com.au",
    })
    await store.insert({
      mbaNumber: "jayco001",
      versionNumber: 14,
      name: "Later save",
      levers: { ...levers, extendDays: 7 },
      result,
      createdByEmail: "luke@assembledmedia.com.au",
    })
    const listed = await store.list("jayco001")
    assert.equal(listed.length, 2)
    assert.equal(listed[0]?.name, "Later save")
    assert.equal(listed[1]?.name, "Move 8k + cap")
  })

  it("compareSavedToLive contrasts saved finish with live plan finish", () => {
    const levers = {
      moves: [{ from: JAYCO_SEARCH.lineItemId, to: JAYCO_META.lineItemId, amount: 8_000 }],
      caps: [{ lineItemId: JAYCO_SEARCH.lineItemId, dailyCap: 164 }],
      pauses: [] as string[],
      extendDays: 0,
      burstDateChanges: [],
    }
    const saved = applyScenario(JAYCO_LINES, levers, JAYCO_AS_OF)
    const live = applyScenario(
      JAYCO_LINES,
      { moves: [], caps: [], pauses: [], extendDays: 0, burstDateChanges: [] },
      JAYCO_AS_OF,
    )
    const compare = compareSavedToLive(saved, live)
    assert.ok(compare.savedFinish !== compare.liveFinish)
    assert.equal(compare.liveBudget, live.campaign.budget)
  })
})
