import assert from "node:assert/strict"
import test from "node:test"

import {
  createAudienceDraft,
  createInitialState,
  planningReducer,
  type AudienceDraft,
} from "../store.js"

test("loading a saved audience then adding yields unique ids and independent drafts", () => {
  let state = createInitialState({ waveId: "W1", defaultSegmentId: "base" })
  const saved: AudienceDraft = createAudienceDraft({
    id: "aud-1",
    name: "Saved Metro",
    colorIndex: 0,
    segmentId: "metro",
    states: ["NSW"],
    ageBands: ["25-34"],
  })

  state = planningReducer(state, {
    type: "LOAD_SAVED",
    waveId: "W1",
    audiences: [saved],
    activeAudienceId: saved.id,
    diagnosis: state.diagnosis,
    excludedChannelIds: [],
  })

  state = planningReducer(state, { type: "ADD_AUDIENCE" })

  assert.equal(state.audiences.length, 2)
  const ids = state.audiences.map((a) => a.id)
  assert.equal(new Set(ids).size, 2, "ids must be unique after load + add")
  assert.notEqual(state.audiences[0]!.id, state.audiences[1]!.id)

  // Independent figures: renaming one must not change the other.
  const firstId = state.audiences[0]!.id
  const secondId = state.audiences[1]!.id
  const secondNameBefore = state.audiences[1]!.name
  state = planningReducer(state, {
    type: "RENAME_AUDIENCE",
    id: firstId,
    name: "Renamed Only",
  })
  assert.equal(state.audiences.find((a) => a.id === firstId)?.name, "Renamed Only")
  assert.equal(state.audiences.find((a) => a.id === secondId)?.name, secondNameBefore)

  state = planningReducer(state, {
    type: "PATCH_AUDIENCE",
    id: secondId,
    patch: { segmentId: "regional" },
  })
  assert.equal(state.audiences.find((a) => a.id === firstId)?.segmentId, "metro")
  assert.equal(state.audiences.find((a) => a.id === secondId)?.segmentId, "regional")
})

test("ADD_AUDIENCE always mints a fresh uuid-style id", () => {
  let state = createInitialState({ waveId: "W1", defaultSegmentId: "base" })
  const first = state.audiences[0]!.id
  state = planningReducer(state, { type: "ADD_AUDIENCE" })
  const second = state.audiences[1]!.id
  assert.notEqual(first, second)
  assert.match(second, /^aud-/)
})
