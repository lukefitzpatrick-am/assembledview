import assert from "node:assert/strict"
import test from "node:test"

import { createAudienceDraft, createInitialState } from "../../../components/planning/store.js"
import { parsePlannerSession, serializePlannerSession } from "../plannerSessionPersist.js"

test("parsePlannerSession normalises missing source to composed without bumping the key", () => {
  const state = createInitialState({ waveId: "W1", defaultSegmentId: "base" })
  const { source: _drop, ...legacyDraft } = state.audiences[0]!
  const raw = JSON.stringify({
    v: 1,
    savedAt: "2026-01-01T00:00:00.000Z",
    state: { ...state, audiences: [legacyDraft] },
    insightByKey: {},
  })
  const snap = parsePlannerSession(raw)
  assert.ok(snap)
  assert.equal(snap!.state.audiences[0]!.source, "composed")
  assert.equal(snap!.v, 1)
})

test("round-trip keeps an uploaded source", () => {
  const state = createInitialState({ waveId: "W1", defaultSegmentId: "base" })
  state.audiences[0] = createAudienceDraft({
    ...state.audiences[0]!,
    source: "uploaded",
    uploadedAudienceId: 9,
    uploadFileName: "run.xlsx",
  })
  const snap = parsePlannerSession(serializePlannerSession(state, {}))
  assert.equal(snap!.state.audiences[0]!.source, "uploaded")
  assert.equal(snap!.state.audiences[0]!.uploadedAudienceId, 9)
})
