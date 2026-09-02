import assert from "node:assert/strict"
import test from "node:test"

import { createAudienceDraft } from "../../../components/planning/store.js"
import {
  audienceKey,
  resolveAudienceFetch,
  toAudienceRequest,
} from "../plannerAudienceRequest.js"

const composed = createAudienceDraft({
  colorIndex: 0,
  segmentId: "base",
  states: ["NAT"],
  ageBands: ["25-34"],
  name: "Live",
})

test("toAudienceRequest returns a live body for composed drafts", () => {
  const body = toAudienceRequest("WAVE1", composed)
  assert.ok(body)
  assert.equal(body!.wave_id, "WAVE1")
  assert.equal(body!.segment_id, "base")
})

test("toAudienceRequest returns null for uploaded drafts", () => {
  const uploaded = { ...composed, source: "uploaded" as const, uploadedAudienceId: 4 }
  assert.equal(toAudienceRequest("WAVE1", uploaded), null)
})

test("audienceKey includes source and uploadedAudienceId so caches do not cross-serve", () => {
  const live = audienceKey("W", composed)
  const uploaded = audienceKey("W", {
    ...composed,
    source: "uploaded",
    uploadedAudienceId: 4,
  })
  assert.notEqual(live, uploaded)
  assert.match(uploaded, /uploaded/)
  assert.match(uploaded, /\|4$/)
})

test("resolveAudienceFetch posts to /audience/uploaded for an uploaded id", () => {
  const spec = resolveAudienceFetch("W", {
    ...composed,
    source: "uploaded",
    uploadedAudienceId: 4,
    reachBasis: "total",
  })
  assert.equal(spec.kind, "uploaded")
  if (spec.kind === "uploaded") {
    assert.equal(spec.url, "/api/planning/audience/uploaded")
    assert.deepEqual(spec.body, { uploaded_audience_id: 4, reach_basis: "total" })
  }
})

test("resolveAudienceFetch skips uploaded drafts with no saved id", () => {
  const spec = resolveAudienceFetch("W", { ...composed, source: "uploaded" })
  assert.equal(spec.kind, "skip")
})
