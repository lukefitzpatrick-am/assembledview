import assert from "node:assert/strict"
import test from "node:test"

import {
  editorBillingStableLineItemId,
  resolveApproval,
} from "@/lib/finance/buildEditorLineItemInputs"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import {
  mbaApprovalPatchLinesFromSelection,
  selectedLineItemIdsFromApprovalRows,
} from "@/lib/finance/mbaLineApprovalsClient"

const DECORATED = editorBillingStableLineItemId(
  "socialMedia",
  { line_item_id: "glenda008SM1" },
  0
)
const CANONICAL = toBillingOverrideLineItemId(DECORATED)
const OTHER_DECORATED = editorBillingStableLineItemId(
  "socialMedia",
  { line_item_id: "glenda008SM2" },
  1
)

/** Same rewrite as edit/create line toggles (canonical Set, then array). */
function pageToggleLine(
  selected: Record<string, string[]>,
  mediaType: string,
  lineItemId: string,
  approved: boolean
): Record<string, string[]> {
  const existing = new Set(
    (selected[mediaType] || []).map((id) => toBillingOverrideLineItemId(id))
  )
  const canonId = toBillingOverrideLineItemId(lineItemId)
  if (approved) existing.add(canonId)
  else existing.delete(canonId)
  return { ...selected, [mediaType]: Array.from(existing) }
}

test("resolveApproval: full MBA → always approved", () => {
  assert.equal(resolveApproval("search", "S1", { isPartialMBA: false }), "approved")
  assert.equal(resolveApproval("search", "S1"), "approved")
})

test("resolveApproval: unlisted channel (undefined) → approved (IN)", () => {
  assert.equal(
    resolveApproval("ooh", "O1", {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { search: ["S1"] },
    }),
    "approved"
  )
})

test("resolveApproval: explicitly emptied channel ([]) → excluded (OUT)", () => {
  assert.equal(
    resolveApproval("search", "S1", {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { search: [] },
    }),
    "excluded"
  )
})

test("resolveApproval: managed channel selects by id; new line defaults excluded", () => {
  assert.equal(
    resolveApproval("search", "S1", {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { search: ["S1"] },
    }),
    "approved"
  )
  assert.equal(
    resolveApproval("search", "S-new", {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { search: ["S1"] },
    }),
    "excluded"
  )
})

test("resolveApproval: decorated id against a canonical set → approved", () => {
  assert.equal(
    resolveApproval("socialMedia", DECORATED, {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { socialMedia: [CANONICAL] },
    }),
    "approved"
  )
})

test("resolveApproval: canonical id against a decorated set → approved", () => {
  assert.equal(
    resolveApproval("socialMedia", CANONICAL, {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { socialMedia: [DECORATED] },
    }),
    "approved"
  )
})

test("resolveApproval: genuinely absent id → excluded", () => {
  assert.equal(
    resolveApproval("socialMedia", OTHER_DECORATED, {
      isPartialMBA: true,
      partialMBASelectedLineItemIds: { socialMedia: [CANONICAL] },
    }),
    "excluded"
  )
})

test("C-103: toggle-off then toggle-on returns the same approval set it started with", () => {
  const mediaType = "socialMedia"
  const decorated = [DECORATED, OTHER_DECORATED]
  let selected: Record<string, string[]> = { [mediaType]: [...decorated] }
  const opts = () => ({
    isPartialMBA: true as const,
    partialMBASelectedLineItemIds: selected,
  })
  const snapshot = () =>
    decorated.map((id) => resolveApproval(mediaType, id, opts()))

  const started = snapshot()
  assert.deepEqual(started, ["approved", "approved"])

  selected = pageToggleLine(selected, mediaType, DECORATED, false)
  assert.deepEqual(snapshot(), ["excluded", "approved"])

  selected = pageToggleLine(selected, mediaType, DECORATED, true)
  assert.deepEqual(snapshot(), started)
})

test("C-103 persist: canonical selected vs decorated perLine ids keep in-scope lines approved", () => {
  const lines = mbaApprovalPatchLinesFromSelection({
    allByMedia: { socialMedia: [DECORATED, OTHER_DECORATED] },
    selectedByMedia: { socialMedia: [CANONICAL, toBillingOverrideLineItemId(OTHER_DECORATED)] },
  })
  assert.deepEqual(
    lines.map((l) => ({
      id: l.line_item_id,
      approved: l.approved,
    })),
    [
      { id: CANONICAL, approved: true },
      { id: toBillingOverrideLineItemId(OTHER_DECORATED), approved: true },
    ]
  )
})

test("C-103 persist: genuinely excluded line is approved:false", () => {
  const lines = mbaApprovalPatchLinesFromSelection({
    allByMedia: { socialMedia: [DECORATED, OTHER_DECORATED] },
    selectedByMedia: { socialMedia: [CANONICAL] },
  })
  const byId = Object.fromEntries(lines.map((l) => [l.line_item_id, l.approved]))
  assert.equal(byId[CANONICAL], true)
  assert.equal(byId[toBillingOverrideLineItemId(OTHER_DECORATED)], false)
})

test("C-103 hydrate: decorated exclusion drops a canonical all-in id", () => {
  const selected = selectedLineItemIdsFromApprovalRows({
    rows: [
      { line_item_id: DECORATED, media_type: "socialMedia", approved: false },
    ],
    allLineIdsByMedia: {
      socialMedia: [CANONICAL, toBillingOverrideLineItemId(OTHER_DECORATED)],
    },
  })
  assert.deepEqual(selected.socialMedia, [
    toBillingOverrideLineItemId(OTHER_DECORATED),
  ])
})

test("C-103 hydrate: canonical exclusion drops a decorated all-in id", () => {
  const selected = selectedLineItemIdsFromApprovalRows({
    rows: [
      { line_item_id: CANONICAL, media_type: "socialMedia", approved: false },
    ],
    allLineIdsByMedia: { socialMedia: [DECORATED, OTHER_DECORATED] },
  })
  assert.deepEqual(selected.socialMedia, [
    toBillingOverrideLineItemId(OTHER_DECORATED),
  ])
})
