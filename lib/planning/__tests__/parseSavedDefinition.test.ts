import assert from "node:assert/strict"
import test from "node:test"

import { resolveAudienceFetch } from "../plannerAudienceRequest.js"
import {
  parseSavedDefinition,
  savedAudienceProvenanceFields,
} from "../savedAudienceDefinition.js"
import { createAudienceDraft } from "../../../components/planning/store.js"

const legacyAudience = {
  id: "aud-legacy-1",
  name: "Core 25-49",
  colorIndex: 0 as const,
  segmentId: "base",
  states: ["NAT"],
  gender: "all",
  ageBands: ["25-34", "35-49"],
  reachBasis: "addressable",
}

const legacyRow = {
  audience: legacyAudience,
  brief: { campaignName: "Summer Push", budget: 500_000 },
  diagnosis: {
    penetration: 35,
    target: 45,
    salience: "medium",
    createCapture: 35,
    weights: { A: 30, T: 25, E: 30, C: 15 },
  },
  exclusions: ["search"],
  wave_id: "WAVE1",
}

test("pre-change saved row defaults source to composed and takes the live fetch branch", () => {
  const parsed = parseSavedDefinition(legacyRow)
  assert.ok(parsed)
  assert.equal(parsed.audience.source, "composed")
  assert.equal(parsed.audience.uploadedAudienceId, undefined)
  assert.equal(parsed.audience.uploadFileName, undefined)
  assert.equal(parsed.wave_id, "WAVE1")
  assert.equal(parsed.audience.name, "Core 25-49")
  const spec = resolveAudienceFetch(parsed.wave_id, parsed.audience)
  assert.equal(spec.kind, "live")
  if (spec.kind === "live") {
    assert.equal(spec.url, "/api/planning/audience")
  }
})

test("uploaded row with additive snake_case keys restores the uploaded fetch branch", () => {
  const parsed = parseSavedDefinition({
    ...legacyRow,
    source: "uploaded",
    uploaded_audience_id: 42,
    upload_file_name: "Grocery buyers.xlsx",
    upload_wave_code: "APR26",
    upload_filter_label: "Grocery buyers",
    audience: { ...legacyAudience, name: "From file" },
  })
  assert.ok(parsed)
  assert.equal(parsed.audience.source, "uploaded")
  assert.equal(parsed.audience.uploadedAudienceId, 42)
  assert.equal(parsed.audience.uploadFileName, "Grocery buyers.xlsx")
  assert.equal(parsed.audience.uploadWaveCode, "APR26")
  assert.equal(parsed.audience.uploadFilterLabel, "Grocery buyers")
  const spec = resolveAudienceFetch(parsed.wave_id, parsed.audience)
  assert.equal(spec.kind, "uploaded")
  if (spec.kind === "uploaded") {
    assert.equal(spec.url, "/api/planning/audience/uploaded")
    assert.deepEqual(spec.body, {
      uploaded_audience_id: 42,
      reach_basis: "addressable",
    })
  }
})

test("nested camelCase upload fields restore when top-level keys are absent", () => {
  const parsed = parseSavedDefinition({
    ...legacyRow,
    audience: {
      ...legacyAudience,
      source: "uploaded",
      uploadedAudienceId: 7,
      uploadFileName: "nested.xlsx",
      uploadWaveCode: "JAN26",
      uploadFilterLabel: "All cases",
    },
  })
  assert.ok(parsed)
  assert.equal(parsed.audience.source, "uploaded")
  assert.equal(parsed.audience.uploadedAudienceId, 7)
  const spec = resolveAudienceFetch("WAVE1", parsed.audience)
  assert.equal(spec.kind, "uploaded")
})

test("savedAudienceProvenanceFields is additive snake_case from the live draft", () => {
  const composed = createAudienceDraft({
    colorIndex: 0,
    segmentId: "base",
    name: "Live",
  })
  assert.deepEqual(savedAudienceProvenanceFields(composed), {
    source: "composed",
    uploaded_audience_id: null,
    upload_file_name: null,
    upload_wave_code: null,
    upload_filter_label: null,
  })

  const uploaded = createAudienceDraft({
    colorIndex: 1,
    segmentId: "base",
    name: "File",
    source: "uploaded",
    uploadedAudienceId: 9,
    uploadFileName: "run.xlsx",
    uploadWaveCode: "APR26",
    uploadFilterLabel: "Grocery buyers",
  })
  assert.deepEqual(savedAudienceProvenanceFields(uploaded), {
    source: "uploaded",
    uploaded_audience_id: 9,
    upload_file_name: "run.xlsx",
    upload_wave_code: "APR26",
    upload_filter_label: "Grocery buyers",
  })
})
