/**
 * MB-33 (B21): old partial MBA selections matched to the editor's current line ids.
 * Shapes are the live ones (SELECT, 3 Nov 2026).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { editorBillingStableLineItemId, resolveApproval } from "@/lib/finance/buildEditorLineItemInputs"
import {
  describeLegacyPartialUnresolved,
  reconcileLegacyPartialSelection,
} from "@/lib/mediaplan/reconcileLegacyPartialSelection"

const dec = (mediaKey: string, ids: string[]) =>
  ids.map((id, i) => editorBillingStableLineItemId(mediaKey, { line_item_id: id }, i))

test("PGAAUS010 v4: ML1 matches DD1 by alias; newspaper and production exact", () => {
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS010",
    channels: [
      { mediaKey: "newspaper", selectedLineItemIds: ["billing-newspaper::PGAAUS010NP1"], selectedCount: 1, totalCount: 1 },
      { mediaKey: "digiDisplay", selectedLineItemIds: ["billing-digiDisplay::PGAAUS010ML1"], selectedCount: 1, totalCount: 1 },
      { mediaKey: "production", selectedLineItemIds: ["billing-production::PGAAUS010PROD1"], selectedCount: 1, totalCount: 1 },
    ],
    editorIdsByMedia: {
      newspaper: dec("newspaper", ["PGAAUS010NP1"]),
      digiDisplay: dec("digiDisplay", ["PGAAUS010DD1"]),
      production: dec("production", ["PGAAUS010PROD1"]),
    },
  })
  assert.deepEqual(r.selected, {
    newspaper: ["PGAAUS010NP1"],
    digiDisplay: ["PGAAUS010DD1"],
    production: ["PGAAUS010PROD1"],
  })
  assert.equal(r.changed, true)
  assert.deepEqual(r.aliasMatches, [
    { mediaKey: "digiDisplay", savedId: "PGAAUS010ML1", editorId: "PGAAUS010DD1" },
  ])
  assert.deepEqual(r.expandedMediaKeys, [])
  assert.deepEqual(r.unresolved, [])
  assert.deepEqual(r.laterAddedMediaKeys, [])
})

test("PGAAUS005 v3: no-code 0051 never pairs by number; the all-selected channel takes its one current line", () => {
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS005",
    channels: [
      { mediaKey: "digiAudio", selectedLineItemIds: ["billing-digiAudio::PGAAUS005DA1"], selectedCount: 1, totalCount: 1 },
      { mediaKey: "production", selectedLineItemIds: ["billing-production::PGAAUS005PROD1"], selectedCount: 1, totalCount: 1 },
      { mediaKey: "socialMedia", selectedLineItemIds: ["billing-socialMedia::PGAAUS0051"], selectedCount: 1, totalCount: 1 },
    ],
    editorIdsByMedia: {
      digiAudio: dec("digiAudio", ["PGAAUS005DA1"]),
      socialMedia: dec("socialMedia", ["PGAAUS005SM1"]),
      production: dec("production", ["PGAAUS005PROD1"]),
    },
  })
  assert.deepEqual(r.selected.socialMedia, ["PGAAUS005SM1"])
  assert.deepEqual(r.selected.digiAudio, ["PGAAUS005DA1"])
  assert.deepEqual(r.selected.production, ["PGAAUS005PROD1"])
  assert.deepEqual(r.expandedMediaKeys, ["socialMedia"])
  assert.deepEqual(r.aliasMatches, [])
  assert.deepEqual(r.unresolved, [])
  assert.equal(r.changed, true)
})

test("old production id -vNNN-pN resolves only through the all-selected rule", () => {
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS010",
    channels: [
      { mediaKey: "production", selectedLineItemIds: ["PGAAUS010-production-v510-p1"], selectedCount: 1, totalCount: 2 },
    ],
    editorIdsByMedia: { production: dec("production", ["PGAAUS010PROD1", "PGAAUS010PROD2"]) },
  })
  assert.deepEqual(r.selected.production, [])
  assert.deepEqual(r.unresolved, [
    { mediaKey: "production", savedId: "PGAAUS010-production-v510-p1", reason: "line_number_not_kept" },
  ])
  const all = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS010",
    channels: [
      { mediaKey: "production", selectedLineItemIds: ["PGAAUS010-production-v510-p1"], selectedCount: 1, totalCount: 1 },
    ],
    editorIdsByMedia: { production: dec("production", ["PGAAUS010PROD1"]) },
  })
  assert.deepEqual(all.selected.production, ["PGAAUS010PROD1"])
  assert.deepEqual(all.expandedMediaKeys, ["production"])
})

test("template ids (v1 shape) resolve only through all-selected; a listed channel with no lines is reported", () => {
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS010",
    channels: [
      { mediaKey: "digiDisplay", selectedLineItemIds: ["digiDisplay-News Corp-RON-0"], selectedCount: 1, totalCount: 1 },
      { mediaKey: "integration", selectedLineItemIds: ["integration-News Corp-Details-0"], selectedCount: 1, totalCount: 1 },
    ],
    editorIdsByMedia: { digiDisplay: dec("digiDisplay", ["PGAAUS010DD1"]) },
  })
  assert.deepEqual(r.selected.digiDisplay, ["PGAAUS010DD1"])
  assert.deepEqual(r.selected.integration, ["integration-News Corp-Details-0"])
  assert.deepEqual(r.missingMediaKeys, ["integration"])
  assert.deepEqual(r.expandedMediaKeys, ["digiDisplay"])

  const partialTemplate = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS010",
    channels: [
      { mediaKey: "digiDisplay", selectedLineItemIds: ["digiDisplay-News Corp-RON-0"], selectedCount: 1, totalCount: 2 },
    ],
    editorIdsByMedia: { digiDisplay: dec("digiDisplay", ["PGAAUS010DD1", "PGAAUS010DD2"]) },
  })
  assert.deepEqual(partialTemplate.selected.digiDisplay, [])
  assert.deepEqual(partialTemplate.unresolved.map((u) => u.reason), ["no_match"])
})

test("explicit 0 of N stays excluded and is not reported", () => {
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PENFOLD015",
    channels: [{ mediaKey: "socialMedia", selectedLineItemIds: [], selectedCount: 0, totalCount: 2 }],
    editorIdsByMedia: { socialMedia: dec("socialMedia", ["PENFOLD015SM1", "PENFOLD015SM2"]) },
  })
  assert.deepEqual(r.selected.socialMedia, [])
  assert.deepEqual(r.unresolved, [])
  assert.equal(r.changed, false)
})

test("B20 finding 3: a no-code id in a partly selected channel never takes another line's number", () => {
  // Saved PGAAUS0051 selected, 0052 not. The editor numbers no-code lines from
  // their saved position, so SM1 might be the old 0052. No pairing: warn and exclude.
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS005",
    channels: [
      { mediaKey: "socialMedia", selectedLineItemIds: ["PGAAUS0051"], selectedCount: 1, totalCount: 2 },
    ],
    editorIdsByMedia: { socialMedia: dec("socialMedia", ["PGAAUS005SM1", "PGAAUS005SM2"]) },
  })
  assert.deepEqual(r.selected.socialMedia, [])
  assert.deepEqual(r.unresolved, [
    { mediaKey: "socialMedia", savedId: "PGAAUS0051", reason: "line_number_not_kept" },
  ])
  assert.deepEqual(r.expandedMediaKeys, [])
})

test("ML id in a partly selected channel pairs one to one", () => {
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS011",
    channels: [{ mediaKey: "digiDisplay", selectedLineItemIds: ["PGAAUS011ML2"], selectedCount: 1, totalCount: 2 }],
    editorIdsByMedia: { digiDisplay: dec("digiDisplay", ["PGAAUS011DD1", "PGAAUS011DD2"]) },
  })
  assert.deepEqual(r.selected.digiDisplay, ["PGAAUS011DD2"])
  assert.deepEqual(r.aliasMatches, [
    { mediaKey: "digiDisplay", savedId: "PGAAUS011ML2", editorId: "PGAAUS011DD2" },
  ])
})

test("alias refused when it is not one to one", () => {
  // DD1 is claimed by its exact saved id, so ML1 can't take it too.
  const claimed = reconcileLegacyPartialSelection({
    mbaNumber: "BOSS001",
    channels: [
      { mediaKey: "digiDisplay", selectedLineItemIds: ["BOSS001DD1", "BOSS001ML1"], selectedCount: 2, totalCount: 3 },
    ],
    editorIdsByMedia: { digiDisplay: dec("digiDisplay", ["BOSS001DD1", "BOSS001DD2", "BOSS001DD3"]) },
  })
  assert.deepEqual(claimed.selected.digiDisplay, ["BOSS001DD1"])
  assert.deepEqual(claimed.unresolved, [
    { mediaKey: "digiDisplay", savedId: "BOSS001ML1", reason: "ambiguous" },
  ])
  // Two current ids with the same alias key: refuse.
  const twoCurrent = reconcileLegacyPartialSelection({
    mbaNumber: "hema001",
    channels: [{ mediaKey: "ooh", selectedLineItemIds: ["hema001ML1"], selectedCount: 1, totalCount: 3 }],
    editorIdsByMedia: { ooh: ["hema001OH1", "HEMA001OH1", "hema001OH2"] },
  })
  assert.deepEqual(twoCurrent.selected.ooh, [])
  assert.equal(twoCurrent.unresolved[0]?.reason, "ambiguous")
})

test("alias refused when two saved ids share one alias key", () => {
  // ML1 and a case-changed DD1 both point at line 1: neither pairs.
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS011",
    channels: [
      { mediaKey: "digiDisplay", selectedLineItemIds: ["PGAAUS011ML1", "pgaaus011DD1"], selectedCount: 2, totalCount: 3 },
    ],
    editorIdsByMedia: { digiDisplay: dec("digiDisplay", ["PGAAUS011DD1", "PGAAUS011DD2"]) },
  })
  assert.deepEqual(r.selected.digiDisplay, [])
  assert.deepEqual(r.unresolved.map((u) => [u.savedId, u.reason]), [
    ["PGAAUS011ML1", "ambiguous"],
    ["pgaaus011DD1", "ambiguous"],
  ])
  assert.deepEqual(r.aliasMatches, [])
})

test("all-selected channel: lines added since stay out when every saved id still matches (PENFOLD015 v36 shape)", () => {
  const saved = Array.from({ length: 94 }, (_, i) => `billing-ooh::PENFOLD015OH${i + 1}`)
  const current = Array.from({ length: 96 }, (_, i) => `PENFOLD015OH${i + 1}`)
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PENFOLD015",
    channels: [{ mediaKey: "ooh", selectedLineItemIds: saved, selectedCount: 94, totalCount: 94 }],
    editorIdsByMedia: { ooh: dec("ooh", current) },
  })
  assert.equal(r.selected.ooh!.length, 94)
  assert.ok(!r.selected.ooh!.includes("PENFOLD015OH95"))
  assert.equal(r.changed, false)
  assert.deepEqual(r.expandedMediaKeys, [])
})

test("all-selected channel with unmatched ids and a different line count: warn, don't expand", () => {
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS005",
    channels: [{ mediaKey: "socialMedia", selectedLineItemIds: ["PGAAUS0051"], selectedCount: 1, totalCount: 1 }],
    editorIdsByMedia: { socialMedia: dec("socialMedia", ["PGAAUS005SM1", "PGAAUS005SM2"]) },
  })
  assert.deepEqual(r.selected.socialMedia, [])
  assert.equal(r.unresolved.length, 1)
  assert.deepEqual(r.expandedMediaKeys, [])
})

test("a current channel the saved selection doesn't list stays unlisted (loads approved) and is reported", () => {
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PENFOLD020",
    channels: [{ mediaKey: "ooh", selectedLineItemIds: ["PENFOLD020OH7"], selectedCount: 1, totalCount: 11 }],
    editorIdsByMedia: {
      ooh: dec("ooh", ["PENFOLD020OH7", "PENFOLD020OH8"]),
      newspaper: dec("newspaper", ["PENFOLD020NP1"]),
      search: [],
    },
  })
  assert.deepEqual(Object.keys(r.selected), ["ooh"])
  assert.deepEqual(r.laterAddedMediaKeys, ["newspaper"])
  assert.equal(
    resolveApproval("newspaper", "billing-newspaper::PENFOLD020NP1", {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: r.selected,
    }),
    "approved"
  )
})

test("MBA prefix is case-insensitive for the alias; inputs are not mutated", () => {
  const channels = [
    { mediaKey: "digiDisplay", selectedLineItemIds: ["pgaaus011ML1"], selectedCount: 1, totalCount: 2 },
  ]
  const editorIdsByMedia = { digiDisplay: ["PGAAUS011DD1", "PGAAUS011DD2"] }
  const before = JSON.stringify({ channels, editorIdsByMedia })
  const r = reconcileLegacyPartialSelection({ mbaNumber: "PGAAUS011", channels, editorIdsByMedia })
  assert.deepEqual(r.selected.digiDisplay, ["PGAAUS011DD1"])
  assert.equal(JSON.stringify({ channels, editorIdsByMedia }), before)
})

test("reconciled ids feed resolveApproval: the MB-33 lines load approved", () => {
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS010",
    channels: [
      { mediaKey: "digiDisplay", selectedLineItemIds: ["billing-digiDisplay::PGAAUS010ML1"], selectedCount: 1, totalCount: 1 },
    ],
    editorIdsByMedia: { digiDisplay: dec("digiDisplay", ["PGAAUS010DD1"]) },
  })
  const opts = { isPartialMBA: true, partialMBASelectedLineItemIds: r.selected }
  assert.equal(resolveApproval("digiDisplay", "billing-digiDisplay::PGAAUS010DD1", opts), "approved")
  // Today's stripped selection excludes it.
  assert.equal(
    resolveApproval("digiDisplay", "billing-digiDisplay::PGAAUS010DD1", {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { digiDisplay: ["PGAAUS010ML1"] },
    }),
    "excluded"
  )
})

test("describeLegacyPartialUnresolved names each line", () => {
  assert.equal(describeLegacyPartialUnresolved([]), null)
  assert.equal(
    describeLegacyPartialUnresolved(
      [{ mediaKey: "socialMedia", savedId: "PGAAUS0051", reason: "line_number_not_kept" }],
      { socialMedia: "Social Media" }
    ),
    "A line saved in this partial MBA has no match on the plan, so it stays out of the MBA: Social Media PGAAUS0051. Check the scope before you publish."
  )
})
