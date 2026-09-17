import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyScenario } from "../applyScenario.js"
import { buildCodexTaskDraft, buildDraftChangeNote } from "../draftChangeNote.js"
import { JAYCO_AS_OF, JAYCO_LINES, JAYCO_META, JAYCO_SEARCH } from "./jaycoFixture.js"

const levers = {
  moves: [{ from: JAYCO_SEARCH.lineItemId, to: JAYCO_META.lineItemId, amount: 8_000 }],
  caps: [{ lineItemId: JAYCO_SEARCH.lineItemId, dailyCap: 164 }],
  pauses: [] as string[],
  extendDays: 0,
  burstDateChanges: [],
}

describe("buildDraftChangeNote", () => {
  it("builds an AVA payload with scenario JSON and a platform-ready ask", () => {
    const result = applyScenario(JAYCO_LINES, levers, JAYCO_AS_OF)
    const payload = buildDraftChangeNote({
      mba: "jayco001",
      campaignName: "Jayco AU",
      lines: JAYCO_LINES,
      levers,
      result,
    })
    assert.match(payload.message, /platform-ready change list/i)
    assert.match(payload.message, /two-line rationale/i)
    assert.match(payload.message, /jayco001/)
    assert.ok(payload.scenario.levers.moves[0]?.amount === 8_000)
    assert.equal(payload.scenario.result.campaign.budget, result.campaign.budget)
    assert.ok(payload.changes.some((row) => row.lineItemId === JAYCO_SEARCH.lineItemId))
    assert.ok(payload.changes.some((row) => row.newDaily === 164))
  })
})

describe("buildCodexTaskDraft", () => {
  it("titles the task Apply scenario and puts the change list in the description", () => {
    const result = applyScenario(JAYCO_LINES, levers, JAYCO_AS_OF)
    const draft = buildCodexTaskDraft({
      mba: "jayco001",
      campaignName: "Jayco AU",
      lines: JAYCO_LINES,
      levers,
      result,
      assigneeEmail: "luke@assembledmedia.com.au",
    })
    assert.equal(draft.title, "Apply scenario: Jayco AU")
    assert.equal(draft.mba_number, "jayco001")
    assert.equal(draft.assignee_email, "luke@assembledmedia.com.au")
    assert.equal(draft.category, "pacing")
    assert.match(draft.description, /jayco001-se/)
    assert.match(draft.description, /164/)
  })
})
