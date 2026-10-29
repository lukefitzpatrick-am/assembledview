/**
 * Never reuse a line id within a plan (Luke, 29 Oct 2026).
 * Live case: golf025SM5 deleted after v9 came back in v40 on a different line.
 */
import assert from "node:assert/strict"
import { afterEach, test } from "node:test"

import {
  MEDIA_TYPE_ID_CODES,
  computeLineIdFloors,
  lineIdFloor,
  nextLineFields,
  noteSavedLineItemIds,
  registerLineIdFloors,
  resetLineIdFloorsForTests,
} from "../lineItemIds.js"
import {
  assignStableLineItemNumbers,
  keepLineIdsOnReorder,
  stripUnmintedLineIdentity,
  type LineItemWithIdentity,
} from "../lineItemOrder.js"
import {
  findRetiredLineIdReuse,
  resolveContinuingVersionIds,
  retiredLineIdMessage,
} from "../retiredLineIds.js"
import { stampProposalForSave } from "../../mediaplans/ingest/stampProposalForSave.js"

const SM = MEDIA_TYPE_ID_CODES.socialMedia
const MBA = "golf025"

afterEach(() => resetLineIdFloorsForTests())

// ---- floors -------------------------------------------------------------

test("floors: highest number per code, this MBA only, case-insensitive", () => {
  const floors = computeLineIdFloors(MBA, [
    "golf025SM1",
    "GOLF025SM5",
    "golf025sm3",
    "golf025DD4",
    "golf025PROD2",
    "golf026SM9", // another plan
    "golf025ML7", // legacy code, cannot collide with a new id
    "random",
    null,
  ])
  assert.deepEqual(floors, { SM: 5, DD: 4, PROD: 2 })
})

test("floors: register merges by max and ignores junk", () => {
  registerLineIdFloors(MBA, { SM: 5, DD: 2 })
  registerLineIdFloors("GOLF025", { SM: 3, DD: 7, XX: 99, PV: "nope" })
  assert.equal(lineIdFloor(MBA, "SM"), 5)
  assert.equal(lineIdFloor(MBA, "DD"), 7)
  assert.equal(lineIdFloor(MBA, "XX"), 0)
  assert.equal(lineIdFloor("other001", "SM"), 0)
  registerLineIdFloors(MBA, null)
  assert.equal(lineIdFloor(MBA, "SM"), 5)
})

// ---- editor: delete top then add ---------------------------------------

test("delete the top line then add: without a floor the id comes back (the bug)", () => {
  const afterDelete = [{ line_item_id: "golf025SM1" }, { line_item_id: "golf025SM2" }]
  // SM3 was the top line and was deleted in this session.
  assert.equal(nextLineFields(afterDelete, MBA, SM).line_item_id, "golf025SM3")
})

test("delete the top line then add: the load floor stops reuse in the session", () => {
  // v9 had SM1..SM5; the editor loaded it and registered the floor.
  registerLineIdFloors(MBA, computeLineIdFloors(MBA, ["golf025SM1", "golf025SM2", "golf025SM3", "golf025SM4", "golf025SM5"]))
  const afterDelete = [1, 2, 3, 4].map((n) => ({ line_item_id: `golf025SM${n}` }))
  const added = nextLineFields(afterDelete, MBA, SM)
  assert.equal(added.line_item_id, "golf025SM6")
  assert.equal(added.line_item, 6)
})

test("delete the top line then add: an id saved earlier in the session is not reused", () => {
  registerLineIdFloors(MBA, { SM: 2 })
  // Session adds SM3 and saves it.
  noteSavedLineItemIds(MBA, ["golf025SM1", "golf025SM2", "golf025SM3"])
  // Then deletes SM3 and adds a line.
  const afterDelete = [{ line_item_id: "golf025SM1" }, { line_item_id: "golf025SM2" }]
  assert.equal(nextLineFields(afterDelete, MBA, SM).line_item_id, "golf025SM4")
})

test("duplicate takes the floor too (same helper as add)", () => {
  registerLineIdFloors(MBA, { SM: 9 })
  const items = [{ line_item_id: "golf025SM1" }]
  assert.equal(nextLineFields(items, MBA, SM).line_item_id, "golf025SM10")
})

test("assign: new and colliding rows mint above the floor; existing ids keep theirs", () => {
  registerLineIdFloors(MBA, { SM: 9 })
  const out = assignStableLineItemNumbers(
    [
      { line_item_id: "golf025SM2", line_item: 2 },
      { line_item_id: "golf025SM7", line_item: 7 },
      {},
      { line_item_id: "golf025SM2", line_item: 2 },
    ],
    MBA,
    SM,
  )
  assert.deepEqual(
    out.map((l) => l.line_item_id),
    ["golf025SM2", "golf025SM7", "golf025SM10", "golf025SM11"],
  )
})

test("assign: a number-only row at or below the floor is new and mints above it", () => {
  registerLineIdFloors(MBA, { SM: 5 })
  const out = assignStableLineItemNumbers(
    [{ line_item_id: "golf025SM1", line_item: 1 }, { line_item: 3 }, { line_item: 8 }],
    MBA,
    SM,
  )
  assert.deepEqual(out.map((l) => l.line_item_id), ["golf025SM1", "golf025SM9", "golf025SM8"])
})

test("assign: deterministic for a fixed floor (render twice, same ids)", () => {
  registerLineIdFloors(MBA, { SM: 5 })
  const items = [{ line_item_id: "golf025SM1" }, {}, { line_item: 2 }]
  const a = assignStableLineItemNumbers(items, MBA, SM).map((l) => l.line_item_id)
  const b = assignStableLineItemNumbers(items, MBA, SM).map((l) => l.line_item_id)
  assert.deepEqual(a, b)
})

test("assign: explicit floor option wins over the registry (server ingest)", () => {
  registerLineIdFloors(MBA, { SM: 50 })
  const rows: LineItemWithIdentity[] = [{}, {}]
  const out = assignStableLineItemNumbers(rows, MBA, SM, { floor: 4 })
  assert.deepEqual(out.map((l) => l.line_item_id), ["golf025SM5", "golf025SM6"])
})

test("assign: no floor keeps the old behaviour", () => {
  const rows: LineItemWithIdentity[] = [{ line_item: 3 }, {}]
  const out = assignStableLineItemNumbers(rows, MBA, SM)
  assert.deepEqual(out.map((l) => l.line_item_id), ["golf025SM3", "golf025SM4"])
})

test("expert grid Apply: rows that are not existing lines mint above the floor", () => {
  registerLineIdFloors(MBA, { SM: 6 })
  const applied = keepLineIdsOnReorder(
    stripUnmintedLineIdentity([
      { line_item_id: "golf025SM4", line_item: 4 },
      { line_item_id: "row-uuid-1", line_item: 2 },
    ]),
    MBA,
    SM,
  )
  assert.deepEqual(applied.map((l) => l.line_item_id), ["golf025SM4", "golf025SM7"])
})

test("reorder keeps ids with a floor registered", () => {
  registerLineIdFloors(MBA, { SM: 9 })
  const out = keepLineIdsOnReorder(
    [{ line_item_id: "golf025SM3", line_item: 1 }, { line_item_id: "golf025SM1", line_item: 2 }],
    MBA,
    SM,
  )
  assert.deepEqual(out.map((l) => l.line_item_id), ["golf025SM3", "golf025SM1"])
})

// ---- ingest stamp -------------------------------------------------------

test("ingest Accept stamps above the plan floor", () => {
  const proposal = {
    media_type: "ooh",
    sheet_name: "Sheet1",
    publisher_name: "JCDecaux",
    grid_semantics: "spend",
    reconciliation: null,
    line_items: [
      { grouping: {}, panels: [], bursts: [], bought_rate: null },
      { grouping: {}, panels: [], bursts: [], bought_rate: null },
    ],
  } as unknown as Parameters<typeof stampProposalForSave>[0]
  const withFloor = stampProposalForSave(proposal, "penfold015", undefined, { OH: 96 })
  assert.deepEqual(
    withFloor.lineItems.map((l) => l.lineItemId),
    ["penfold015OH97", "penfold015OH98"],
  )
  const noFloor = stampProposalForSave(proposal, "penfold015")
  assert.deepEqual(noFloor.lineItems.map((l) => l.lineItemId), ["penfold015OH1", "penfold015OH2"])
})

// ---- server check -------------------------------------------------------

const versions = [
  { versionId: 109, versionNumber: 9 },
  { versionId: 139, versionNumber: 39 },
  { versionId: 140, versionNumber: 40 },
]
const rows = [
  { versionId: 109, lineItemId: "golf025SM4" },
  { versionId: 109, lineItemId: "golf025SM5" },
  { versionId: 139, lineItemId: "golf025SM4" },
  { versionId: 140, lineItemId: "golf025SM4" },
]

test("continuing: base when it belongs to the plan, else the tip; draft adds the target", () => {
  assert.deepEqual(
    resolveContinuingVersionIds({ mode: "publish", versions, targetVersionId: 141, baseVersionId: 139 }),
    [139],
  )
  assert.deepEqual(
    resolveContinuingVersionIds({ mode: "publish", versions, targetVersionId: 141, baseVersionId: 999 }),
    [140],
  )
  assert.deepEqual(
    resolveContinuingVersionIds({ mode: "new_version", versions, targetVersionId: 141 }),
    [140],
  )
  assert.deepEqual(
    resolveContinuingVersionIds({ mode: "draft", versions, targetVersionId: 140, baseVersionId: 139 }),
    [140, 139],
  )
  // Draft with no base: the target is excluded from the tip pick.
  assert.deepEqual(
    resolveContinuingVersionIds({ mode: "draft", versions, targetVersionId: 140 }),
    [140, 139],
  )
})

test("reuse across versions is blocked: SM5 left after v9 and comes back from v39", () => {
  const reuse = findRetiredLineIdReuse({
    versions,
    rows,
    continuingVersionIds: [139],
    incomingLineItemIds: ["golf025SM4", "GOLF025SM5", "golf025SM6"],
  })
  assert.deepEqual(reuse, [{ lineItemId: "GOLF025SM5", lastVersionNumber: 9 }])
  const msg = retiredLineIdMessage(reuse)
  assert.match(msg, /GOLF025SM5 \(last used in v9\)/)
  assert.match(msg, /never reused/)
})

test("continuing lines keep their ids (same line across versions passes)", () => {
  assert.deepEqual(
    findRetiredLineIdReuse({
      versions,
      rows,
      continuingVersionIds: [139],
      incomingLineItemIds: ["golf025SM4", "golf025SM6"],
    }),
    [],
  )
})

test("forking an old version keeps that version's lines", () => {
  // Editing v9 (SM5 still on it) and publishing: SM5 is the same line.
  assert.deepEqual(
    findRetiredLineIdReuse({
      versions,
      rows,
      continuingVersionIds: [109],
      incomingLineItemIds: ["golf025SM4", "golf025SM5"],
    }),
    [],
  )
})

test("a brand-new plan has no history and nothing is refused", () => {
  assert.deepEqual(
    findRetiredLineIdReuse({
      versions: [],
      rows: [],
      continuingVersionIds: [],
      incomingLineItemIds: ["new001SM1"],
    }),
    [],
  )
})
