import assert from "node:assert/strict"
import test from "node:test"

import {
  createAudienceDraft,
  isAudiencesComplete,
  type AudienceDraft,
} from "../store.js"

function composed(over: Partial<AudienceDraft> = {}): AudienceDraft {
  return createAudienceDraft({
    colorIndex: 0,
    segmentId: "base",
    ...over,
  })
}

test("createAudienceDraft defaults source to composed and leaves upload fields undefined", () => {
  const d = composed()
  assert.equal(d.source, "composed")
  assert.equal(d.uploadedAudienceId, undefined)
  assert.equal(d.uploadFileName, undefined)
  assert.equal(d.uploadWaveCode, undefined)
  assert.equal(d.uploadFilterLabel, undefined)
})

test("isAudiencesComplete still requires states + ageBands + name for composed drafts", () => {
  assert.equal(isAudiencesComplete([composed({ name: "A", states: ["NAT"], ageBands: ["25-34"] })]), true)
  assert.equal(isAudiencesComplete([composed({ name: "A", states: [], ageBands: ["25-34"] })]), false)
  assert.equal(isAudiencesComplete([composed({ name: "", states: ["NAT"], ageBands: ["25-34"] })]), false)
})

test("isAudiencesComplete for uploaded drafts needs name and uploadedAudienceId only", () => {
  const uploaded = composed({
    name: "From file",
    source: "uploaded",
    uploadedAudienceId: 12,
    states: [],
    ageBands: [],
  })
  assert.equal(isAudiencesComplete([uploaded]), true)
  assert.equal(
    isAudiencesComplete([{ ...uploaded, uploadedAudienceId: undefined }]),
    false
  )
  assert.equal(isAudiencesComplete([{ ...uploaded, name: "  " }]), false)
})
