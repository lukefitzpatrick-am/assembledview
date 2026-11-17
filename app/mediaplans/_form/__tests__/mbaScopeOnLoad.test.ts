/**
 * B52: the MBA scope a saved version opens with, as behaviour. Replaces the
 * MB-33 (B21, B21fix) edit source pins (legacyPartialEditWiring.b21).
 */
import assert from "node:assert/strict"
import test from "node:test"

import { editorBillingStableLineItemId } from "@/lib/finance/buildEditorLineItemInputs"
import type { FetchMbaLineApprovalsResult } from "@/lib/finance/mbaLineApprovalsClient"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import { prepareEditorLines } from "@/lib/mediaplan/lineItemOrder"

import { mbaScopeFromVersion, resolveMbaScopeOnLoad } from "../mbaScopeOnLoad"

const MBA = "X1"
const loaded = [
  { line_item_id: "X1DD1", line_item: 1 },
  { line_item_id: "X1ML1", line_item: 2 },
]
// The editor renumbers them DD1, DD2.
const editorIds = prepareEditorLines(loaded.map((l) => ({ ...l })), MBA, MEDIA_TYPE_ID_CODES.digitalDisplay).map(
  (raw, i) => editorBillingStableLineItemId("digiDisplay", raw, i)
)
const editorIdsByMedia = { digiDisplay: editorIds, radio: [editorBillingStableLineItemId("radio", { line_item_id: "X1RA1" }, 0)] }
const labels = { digiDisplay: "Digital Display", radio: "Radio" }

function fetcher(result: FetchMbaLineApprovalsResult) {
  const calls: number[] = []
  return { calls, fetchApprovals: async () => (calls.push(1), result) }
}

const noRows: FetchMbaLineApprovalsResult = { ok: true, rows: [], available: false }
const oldPartial = [
  { mediaKey: "digiDisplay", selectedLineItemIds: ["billing-digiDisplay::X1ML1"], selectedCount: 1, totalCount: 2 },
]

const base = {
  editorIdsByMedia,
  legacyChannels: null,
  allChannelsHydrated: true,
  loadedLinesByMedia: { digiDisplay: loaded },
  mbaNumber: MBA,
  mediaLabelByKey: labels,
}

test("the version's mba_scope is read first, with its months and partial flag", () => {
  const scope = mbaScopeFromVersion({ lineItemIds: ["X1DD2"], monthYears: ["March 2026"], partial: true }, editorIdsByMedia)
  assert.deepEqual(scope, {
    kind: "selected",
    selected: { digiDisplay: ["X1DD2"], radio: [] },
    isPartial: true,
    monthYears: ["March 2026"],
  })
  assert.equal(mbaScopeFromVersion(null, editorIdsByMedia), null)
  assert.equal(mbaScopeFromVersion(undefined, editorIdsByMedia), null)
})

test("an old partial MBA waits for every channel's lines before the approvals GET", async () => {
  const f = fetcher(noRows)
  const scope = await resolveMbaScopeOnLoad({ ...base, legacyChannels: oldPartial, allChannelsHydrated: false, fetchApprovals: f.fetchApprovals })
  assert.deepEqual(scope, { kind: "wait" })
  assert.equal(f.calls.length, 0)
})

test("approval rows: the lines left in, partial when any line is excluded, months from the baseline", async () => {
  const f = fetcher({
    ok: true,
    available: true,
    rows: [{ media_type: "digiDisplay", line_item_id: "X1DD2", approved: false }] as never,
  })
  const scope = await resolveMbaScopeOnLoad({ ...base, legacyChannels: oldPartial, fetchApprovals: f.fetchApprovals })
  assert.equal(f.calls.length, 1)
  assert.deepEqual(scope, { kind: "selected", selected: { digiDisplay: ["X1DD1"], radio: ["X1RA1"] }, isPartial: true, monthYears: null })
  const all = await resolveMbaScopeOnLoad({
    ...base,
    fetchApprovals: fetcher({ ok: true, available: true, rows: [{ media_type: "radio", line_item_id: "X1RA1", approved: true }] as never }).fetchApprovals,
  })
  assert.equal(all.kind === "selected" && all.isPartial, false)
})

test("no approval rows and no old partial MBA: nothing to apply", async () => {
  for (const result of [noRows, { ok: false, error: "x", available: false } as const]) {
    assert.deepEqual(await resolveMbaScopeOnLoad({ ...base, fetchApprovals: fetcher(result).fetchApprovals }), { kind: "legacy", legacy: null })
  }
})

test("no approval rows: the old partial MBA is matched with the loaded lines, so ML1 beside a current DD1 is refused", async () => {
  const scope = await resolveMbaScopeOnLoad({ ...base, legacyChannels: oldPartial, fetchApprovals: fetcher(noRows).fetchApprovals })
  assert.equal(scope.kind, "legacy")
  const legacy = scope.kind === "legacy" ? scope.legacy : null
  assert.ok(legacy)
  assert.deepEqual(legacy!.onOpen.unresolved, [{ mediaKey: "digiDisplay", savedId: "X1ML1", reason: "ambiguous" }])
  // The ids moved (ML1 is out), and the toast fires once, on open, from the match result.
  assert.deepEqual(legacy!.selected?.digiDisplay, [])
  assert.equal(legacy!.toast?.title, "Partial MBA lines not matched")
  assert.equal(legacy!.toast?.variant, "destructive")
  assert.match(legacy!.toast!.description, /Digital Display/)
  // Saved months and values are not part of the result: they stay as saved.
  assert.deepEqual(Object.keys(legacy!).sort(), ["laterAddedMediaKeys", "onOpen", "selected", "toast"])
  // Without the loaded lines the B21 pairing would take the wrong line.
  const blind = await resolveMbaScopeOnLoad({ ...base, loadedLinesByMedia: {}, legacyChannels: oldPartial, fetchApprovals: fetcher(noRows).fetchApprovals })
  assert.deepEqual(blind.kind === "legacy" ? blind.legacy?.selected?.digiDisplay : null, ["X1DD1"])
})

test("an old partial MBA that still matches as saved moves no ids and raises no toast", async () => {
  const exact = [{ mediaKey: "radio", selectedLineItemIds: ["billing-radio::X1RA1"], selectedCount: 1, totalCount: 1 }]
  const radioOnly = { radio: editorIdsByMedia.radio }
  const scope = await resolveMbaScopeOnLoad({ ...base, editorIdsByMedia: radioOnly, legacyChannels: exact, fetchApprovals: fetcher(noRows).fetchApprovals })
  const legacy = scope.kind === "legacy" ? scope.legacy : null
  assert.equal(legacy?.selected, null)
  assert.equal(legacy?.toast, null)
  assert.deepEqual(legacy?.onOpen.unresolved, [])
})

test("a channel added since the old partial MBA joins with its lines (B21fix R1)", async () => {
  const exact = [{ mediaKey: "radio", selectedLineItemIds: ["billing-radio::X1RA1"], selectedCount: 1, totalCount: 1 }]
  const scope = await resolveMbaScopeOnLoad({ ...base, legacyChannels: exact, fetchApprovals: fetcher(noRows).fetchApprovals })
  const legacy = scope.kind === "legacy" ? scope.legacy : null
  assert.deepEqual(legacy?.selected, { digiDisplay: ["X1DD1", "X1DD2"], radio: ["X1RA1"] })
  assert.deepEqual(legacy?.laterAddedMediaKeys, ["digiDisplay"])
})
