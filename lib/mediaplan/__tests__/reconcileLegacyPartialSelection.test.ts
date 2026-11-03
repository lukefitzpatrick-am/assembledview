/**
 * MB-33 (B21): old partial MBA selections matched to the editor's current line ids.
 * Shapes are the live ones (SELECT, 3 Nov 2026).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { editorBillingStableLineItemId, resolveApproval } from "@/lib/finance/buildEditorLineItemInputs"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import { prepareEditorLines } from "@/lib/mediaplan/lineItemOrder"
import { canonicalisePartialMbaSelectedLineItemIds } from "@/lib/finance/mbaLineApprovalsClient"
import {
  buildMbaScopeForSaveBody,
  selectedLineItemIdsByMediaFromMbaScope,
} from "@/lib/mediaplan/mbaScopeClient"
import { applyMbaScopeLineApprovals, type MbaScopeApprovalLine } from "@/lib/mediaplan/mbaScopeForSave"
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

/** Loaded lines as the editor gets them, and the editor ids `prepareEditorLines` gives them. */
function loadDigiDisplay(mba: string, lines: Array<[string, number]>) {
  const loaded = lines.map(([line_item_id, position]) => ({ line_item_id, line_item: position }))
  const prepared = prepareEditorLines(
    loaded.map((l) => ({ ...l })),
    mba,
    MEDIA_TYPE_ID_CODES.digitalDisplay
  )
  return {
    loaded,
    editorIds: prepared.map((raw, i) => editorBillingStableLineItemId("digiDisplay", raw, i)),
  }
}

test("B21fix finding 2: ML1 beside a current DD1 is refused, not paired with the new DD1", () => {
  // Reviewer probe: [X1DD1 (new, position 1), X1ML1 (old, position 2)] loads as DD1, DD2.
  const { loaded, editorIds } = loadDigiDisplay("X1", [["X1DD1", 1], ["X1ML1", 2]])
  assert.deepEqual(editorIds, ["billing-digiDisplay::X1DD1", "billing-digiDisplay::X1DD2"])
  const channels = [
    { mediaKey: "digiDisplay", selectedLineItemIds: ["billing-digiDisplay::X1ML1"], selectedCount: 1, totalCount: 2 },
  ]
  // Without the loaded lines: the B21 pairing, onto the wrong line.
  const blind = reconcileLegacyPartialSelection({ mbaNumber: "X1", channels, editorIdsByMedia: { digiDisplay: editorIds } })
  assert.deepEqual(blind.selected.digiDisplay, ["X1DD1"])
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "X1",
    channels,
    editorIdsByMedia: { digiDisplay: editorIds },
    loadedLinesByMedia: { digiDisplay: loaded },
  })
  assert.deepEqual(r.selected.digiDisplay, [])
  assert.deepEqual(r.aliasMatches, [])
  assert.deepEqual(r.unresolved, [{ mediaKey: "digiDisplay", savedId: "X1ML1", reason: "ambiguous" }])
  assert.equal(
    resolveApproval("digiDisplay", "billing-digiDisplay::X1DD1", { isPartialMBA: true, partialMBASelectedLineItemIds: r.selected }),
    "excluded"
  )
})

test("B21fix finding 2: a saved number the editor gave to a renumbered line is refused", () => {
  // DD1 and ML1 both ask for 1; the ML1 line is renumbered to DD2. A saved ML2
  // (a line no longer loaded) must not take it.
  const { loaded, editorIds } = loadDigiDisplay("X1", [["X1DD1", 1], ["X1ML1", 2]])
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "X1",
    channels: [{ mediaKey: "digiDisplay", selectedLineItemIds: ["X1ML2"], selectedCount: 1, totalCount: 2 }],
    editorIdsByMedia: { digiDisplay: editorIds },
    loadedLinesByMedia: { digiDisplay: loaded },
  })
  assert.deepEqual(r.selected.digiDisplay, [])
  assert.deepEqual(r.unresolved, [{ mediaKey: "digiDisplay", savedId: "X1ML2", reason: "ambiguous" }])
})

test("B21fix finding 2: a no-code line holding the number by position refuses the ML pair", () => {
  // X1007 (no code, position 1) takes number 1 from its position; X1ML1 is renumbered.
  const { loaded, editorIds } = loadDigiDisplay("X1", [["X1007", 1], ["X1ML1", 2]])
  assert.deepEqual(editorIds, ["billing-digiDisplay::X1DD1", "billing-digiDisplay::X1DD2"])
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "X1",
    channels: [{ mediaKey: "digiDisplay", selectedLineItemIds: ["X1ML1"], selectedCount: 1, totalCount: 2 }],
    editorIdsByMedia: { digiDisplay: editorIds },
    loadedLinesByMedia: { digiDisplay: loaded },
  })
  assert.deepEqual(r.selected.digiDisplay, [])
  assert.equal(r.unresolved[0]?.reason, "ambiguous")
})

test("B21fix finding 2: a no-code line is never proof of the number, even when its id and position agree", () => {
  // X11 (no code, position 1) holds 1 by position; its id number is a guess (B20 finding 3).
  const { loaded, editorIds } = loadDigiDisplay("X1", [["X11", 1], ["X1ML2", 2]])
  assert.deepEqual(editorIds, ["billing-digiDisplay::X1DD1", "billing-digiDisplay::X1DD2"])
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "X1",
    channels: [{ mediaKey: "digiDisplay", selectedLineItemIds: ["X1ML1"], selectedCount: 1, totalCount: 2 }],
    editorIdsByMedia: { digiDisplay: editorIds },
    loadedLinesByMedia: { digiDisplay: loaded },
  })
  assert.deepEqual(r.selected.digiDisplay, [])
  assert.deepEqual(r.unresolved, [{ mediaKey: "digiDisplay", savedId: "X1ML1", reason: "ambiguous" }])
})

test("B21fix finding 2: the live shapes still pair with the loaded lines given", () => {
  // PGAAUS010 v4: one digital display line, loaded as ML1.
  const v4 = loadDigiDisplay("PGAAUS010", [["PGAAUS010ML1", 1]])
  const r4 = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS010",
    channels: [
      { mediaKey: "digiDisplay", selectedLineItemIds: ["billing-digiDisplay::PGAAUS010ML1"], selectedCount: 1, totalCount: 1 },
    ],
    editorIdsByMedia: { digiDisplay: v4.editorIds },
    loadedLinesByMedia: { digiDisplay: v4.loaded },
  })
  assert.deepEqual(r4.selected.digiDisplay, ["PGAAUS010DD1"])
  assert.deepEqual(r4.unresolved, [])
  // The line rewritten to DD1 by a later save: still the line whose id carries 1.
  const rewritten = loadDigiDisplay("PGAAUS010", [["PGAAUS010DD1", 1]])
  const rr = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS010",
    channels: [{ mediaKey: "digiDisplay", selectedLineItemIds: ["PGAAUS010ML1"], selectedCount: 1, totalCount: 2 }],
    editorIdsByMedia: { digiDisplay: rewritten.editorIds },
    loadedLinesByMedia: { digiDisplay: rewritten.loaded },
  })
  assert.deepEqual(rr.selected.digiDisplay, ["PGAAUS010DD1"])
  // Two ML lines, the second selected: ML2 keeps its number and pairs.
  const two = loadDigiDisplay("PGAAUS011", [["PGAAUS011ML1", 1], ["PGAAUS011ML2", 2]])
  const r2 = reconcileLegacyPartialSelection({
    mbaNumber: "PGAAUS011",
    channels: [{ mediaKey: "digiDisplay", selectedLineItemIds: ["PGAAUS011ML2"], selectedCount: 1, totalCount: 2 }],
    editorIdsByMedia: { digiDisplay: two.editorIds },
    loadedLinesByMedia: { digiDisplay: two.loaded },
  })
  assert.deepEqual(r2.selected.digiDisplay, ["PGAAUS011DD2"])
  assert.deepEqual(r2.aliasMatches, [
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

test("B21fix R1: a current channel the saved selection doesn't list joins the selection with every current line", () => {
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PENFOLD020",
    channels: [{ mediaKey: "ooh", selectedLineItemIds: ["PENFOLD020OH7"], selectedCount: 1, totalCount: 11 }],
    editorIdsByMedia: {
      ooh: dec("ooh", ["PENFOLD020OH7", "PENFOLD020OH8"]),
      newspaper: dec("newspaper", ["PENFOLD020NP1", "PENFOLD020NP2"]),
      search: [],
    },
  })
  assert.deepEqual(r.selected, {
    ooh: ["PENFOLD020OH7"],
    newspaper: ["PENFOLD020NP1", "PENFOLD020NP2"],
  })
  assert.equal(r.changed, true)
  assert.deepEqual(r.laterAddedMediaKeys, ["newspaper"])
  // A channel with no lines is not later-added and is not listed.
  assert.equal("search" in r.selected, false)
  for (const id of ["PENFOLD020NP1", "PENFOLD020NP2"]) {
    assert.equal(
      resolveApproval("newspaper", `billing-newspaper::${id}`, {
        isPartialMBA: true,
        partialMBASelectedLineItemIds: r.selected,
      }),
      "approved"
    )
  }
  assert.equal(
    resolveApproval("ooh", "billing-ooh::PENFOLD020OH8", {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: r.selected,
    }),
    "excluded"
  )
})

test("B21fix R1: the save body keeps the later-added channel, and a reopen keeps it in (finding 1)", () => {
  // PENFOLD020 v9 shape: ooh 4 of 11 saved; newspaper, prog display, prog video
  // and social added since. Before the fix the save sent ooh only.
  const editorIdsByMedia = {
    ooh: dec("ooh", ["PENFOLD020OH1", "PENFOLD020OH2", "PENFOLD020OH7", "PENFOLD020OH9", "PENFOLD020OH13"]),
    newspaper: dec("newspaper", ["PENFOLD020NP1", "PENFOLD020NP2"]),
    progDisplay: dec("progDisplay", ["PENFOLD020PD1"]),
    progVideo: dec("progVideo", ["PENFOLD020PV1", "PENFOLD020PV2"]),
    socialMedia: dec("socialMedia", ["PENFOLD020SM1", "PENFOLD020SM2"]),
  }
  const r = reconcileLegacyPartialSelection({
    mbaNumber: "PENFOLD020",
    channels: [
      {
        mediaKey: "ooh",
        selectedLineItemIds: ["PENFOLD020OH1", "PENFOLD020OH2", "PENFOLD020OH7", "PENFOLD020OH9"],
        selectedCount: 4,
        totalCount: 11,
      },
    ],
    editorIdsByMedia,
  })
  assert.deepEqual(r.laterAddedMediaKeys, ["newspaper", "progDisplay", "progVideo", "socialMedia"])
  const selection = canonicalisePartialMbaSelectedLineItemIds(r.selected)
  const body = buildMbaScopeForSaveBody({
    isPartialMBA: true,
    partialMBASelectedLineItemIds: selection,
    partialMBAMonthYears: ["January 2026"],
  })
  const later = ["PENFOLD020NP1", "PENFOLD020NP2", "PENFOLD020PD1", "PENFOLD020PV1", "PENFOLD020PV2", "PENFOLD020SM1", "PENFOLD020SM2"]
  for (const id of later) assert.ok(body.lineItemIds?.includes(id), `${id} in the save body`)
  assert.equal(body.lineItemIds?.includes("PENFOLD020OH13"), false)
  // Server: every later-added line approved, the unselected ooh line excluded.
  const lines = Object.values(editorIdsByMedia).flat().map((lineItemId): MbaScopeApprovalLine => ({ lineItemId }))
  const approvals = applyMbaScopeLineApprovals(lines, body.lineItemIds)
  const approved = approvals.filter((l) => l.approval === "approved").map((l) => l.lineItemId.replace(/^billing-[^:]+::/, ""))
  assert.deepEqual(approved.toSorted(), [...later, "PENFOLD020OH1", "PENFOLD020OH2", "PENFOLD020OH7", "PENFOLD020OH9"].toSorted())
  // Reopen from the saved mba_scope: the same lines are in.
  const reopened = selectedLineItemIdsByMediaFromMbaScope({
    lineItemIds: body.lineItemIds,
    allLineIdsByMedia: editorIdsByMedia,
  })
  assert.deepEqual(reopened.newspaper, ["PENFOLD020NP1", "PENFOLD020NP2"])
  assert.deepEqual(reopened.ooh, ["PENFOLD020OH1", "PENFOLD020OH2", "PENFOLD020OH7", "PENFOLD020OH9"])
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
