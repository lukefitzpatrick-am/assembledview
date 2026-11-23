/** S5fix: the candidate filter the Match tab and the unmatched queue share. */
import assert from "node:assert/strict"
import test from "node:test"

import { buildMatchSuggestions, classifyMatch, legacyLineIdReason, sameNumberCandidates } from "../rules.js"

const lines = [
  { lineItemId: "hartm001sm1", lineChannel: "social" },
  { lineItemId: "hartm001se1", lineChannel: "search" },
  { lineItemId: "hartm001sm2", lineChannel: "social" },
  { lineItemId: "hartm002sm1", lineChannel: "social" },
]

test("same MBA, number and channel family; never the id itself; nothing for an unparsed id", () => {
  assert.deepEqual(sameNumberCandidates("Social - Meta", "hartm0011", lines).map((l) => l.lineItemId), ["hartm001sm1"])
  assert.deepEqual(sameNumberCandidates("Search - Google Ads", "hartm001ml1", lines).map((l) => l.lineItemId), ["hartm001se1"])
  assert.deepEqual(sameNumberCandidates("Social - Meta", "hartm001sm1", lines), [])
  assert.deepEqual(sameNumberCandidates("Social - Meta", "not an id", lines), [])
})

test("legacy reason: ML and no-code only", () => {
  assert.match(legacyLineIdReason("hartm001ml1")!, /uses the legacy ML code \(before May 2026\)/)
  assert.equal(legacyLineIdReason("hartm0011"), "hartm0011 is missing its media code")
  assert.equal(legacyLineIdReason("hartm001sm1"), null)
  assert.equal(legacyLineIdReason(""), null)
})

test("Match tab keeps its duplicate guard on the shared filter: a no-code Meta twin is a duplicate, not high", () => {
  const entity = (key: string, lineItemId: string) => ({
    channel: "Social - Meta",
    platformEntityId: key,
    lineItemId,
    name: key,
    campaignName: "c",
    firstDate: "2026-10-01",
    lastDate: "2026-10-31",
    spend: 812.4,
    impressions: 10,
  })
  const planLines = lines.map((l) => ({ ...l, mbaNumber: l.lineItemId.slice(0, 8), platform: "", buyType: "", startDate: "2026-10-01", endDate: "2026-10-31" }))
  const { entities, lines: classified } = classifyMatch([entity("on", "hartm001sm1"), entity("twin", "hartm0011")], planLines, ["hartm001", "hartm002"])
  const suggestions = buildMatchSuggestions(entities, classified)
  assert.deepEqual(suggestions.map((s) => s.kind), ["duplicate"])
  const alone = classifyMatch([entity("twin", "hartm0011")], planLines, ["hartm001", "hartm002"])
  const high = buildMatchSuggestions(alone.entities, alone.lines)
  assert.deepEqual(high.map((s) => [s.kind, s.targetLineIds]), [["high", ["hartm001sm1"]]])
})
