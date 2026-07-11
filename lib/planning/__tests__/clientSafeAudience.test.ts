import assert from "node:assert/strict"
import test from "node:test"
import {
  buildDefinitionLine,
  CLIENT_SAFE_FORBIDDEN_KEYS,
  resolveAudiencePatchInput,
} from "../clientSafeAudienceShared.js"
import type { ClientSafePlannedAudience } from "../audienceTypes.js"

test("buildDefinitionLine formats plain-english summary", () => {
  const line = buildDefinitionLine({
    segmentName: "Metro",
    states: ["NSW", "VIC"],
    ageBands: ["25-34", "35-49"],
    gender: "all",
  })
  assert.equal(line, "Metro lens · NSW + VIC · 25–49 · all genders")
})

test("client-safe payload shape has no forbidden keys", () => {
  const sample: ClientSafePlannedAudience = {
    id: 1,
    name: "Test",
    composed_wc: 120,
    client_visible: true,
    created_at: "2026-07-01T00:00:00.000Z",
    wave_label: "Roy Morgan, Mar 2026",
    definition_summary: {
      segment_name: "Metro",
      states: ["NSW"],
      age_bands: ["25-34"],
      gender: "all genders",
      reach_basis: "addressable",
    },
    definition_line: "Metro lens · NSW · 25-34 · all genders",
    reach_index: [{ channel: "FTA", reach_pct: 42, affinity_index: 110 }],
  }
  const json = JSON.stringify(sample)
  for (const key of CLIENT_SAFE_FORBIDDEN_KEYS) {
    assert.equal(
      json.includes(`"${key}"`),
      false,
      `forbidden key leaked: ${key}`
    )
  }
  assert.ok("reach_pct" in sample.reach_index[0]!)
  assert.ok("affinity_index" in sample.reach_index[0]!)
  assert.equal("budget" in sample, false)
  assert.equal("definition_json" in sample, false)
})

test("detach clears client_visible in the same patch", () => {
  const patch = resolveAudiencePatchInput({
    mba_number: null,
    client_visible: true,
  })
  assert.equal(patch.mba_number, null)
  assert.equal(patch.client_visible, false)
})
