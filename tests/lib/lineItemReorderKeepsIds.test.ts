import assert from "node:assert/strict"
import test from "node:test"

import { explodeExcelLineItems } from "../../lib/docs/explodeExcelLineItems.js"
import {
  MEDIA_TYPE_ID_CODES,
  buildLineItemId,
  nextLineFields,
} from "../../lib/mediaplan/lineItemIds.js"
import {
  keepLineIdsOnReorder,
  lineDisplayNumber,
  orderLinesForExport,
  prepareEditorLines,
  stripUnmintedLineIdentity,
} from "../../lib/mediaplan/lineItemOrder.js"

const MBA = "PEN"
const BURST = {
  budget: "100",
  buyAmount: "10",
  startDate: "2025-01-05",
  endDate: "2025-01-11",
  calculatedValue: 1,
  cost: 100,
  amount: 1,
}

const EXCEL_KEY: Record<string, string> = {
  TV: "television",
  NP: "newspaper",
  SM: "socialMedia",
  RA: "radio",
  MG: "magazines",
  CN: "cinema",
  DD: "digiDisplay",
  DA: "digiAudio",
  DV: "digiVideo",
  BV: "bvod",
  IT: "integration",
  SE: "search",
  PD: "progDisplay",
  PV: "progVideo",
  PB: "progBvod",
  PA: "progAudio",
  PO: "progOoh",
  OH: "ooh",
  IN: "influencers",
  PROD: "production",
}

for (const [channel, code] of Object.entries(MEDIA_TYPE_ID_CODES)) {
  const id = (n: number) => buildLineItemId(MBA, code, n)

  test(`${channel} reorder keeps minted ids and changes position only`, () => {
    const reordered = keepLineIdsOnReorder(
      [
        { name: "c", line_item: 9, line_item_id: id(9), lineItemId: id(9) },
        { name: "a", line_item: 4, line_item_id: id(4), lineItemId: id(4) },
        { name: "b", line_item: 7, line_item_id: id(7), lineItemId: id(7) },
      ],
      MBA,
      code,
    )
    assert.deepEqual(
      reordered.map((line) => line.line_item_id),
      [id(9), id(4), id(7)],
    )
    assert.deepEqual(
      reordered.map((line) => line.position),
      [0, 1, 2],
    )
    assert.deepEqual(
      reordered.map((line) => line.line_item),
      [9, 4, 7],
    )
  })

  test(`${channel} export order and labels follow position`, () => {
    const ordered = orderLinesForExport([
      { name: "c", line_item_id: id(9), lineItemId: id(9), line_item: 9, position: 2, buyType: "fixed_cost", bursts: [BURST] },
      { name: "a", line_item_id: id(4), lineItemId: id(4), line_item: 4, position: 0, buyType: "fixed_cost", bursts: [BURST] },
      { name: "b", line_item_id: id(7), lineItemId: id(7), line_item: 7, position: 1, buyType: "fixed_cost", bursts: [BURST] },
    ])
    assert.deepEqual(
      ordered.map((line) => line.name),
      ["a", "b", "c"],
    )
    assert.deepEqual(
      ordered.map((line, index) => lineDisplayNumber(line, index)),
      [1, 2, 3],
    )
    const rows = ordered.flatMap((line, index) =>
      explodeExcelLineItems(EXCEL_KEY[code] as "television", line, 10, index),
    )
    assert.deepEqual(
      rows.map((row) => row.line_item_id),
      [id(4), id(7), id(9)],
    )
    assert.deepEqual(
      rows.map((row) => row.line_item),
      [1, 2, 3],
    )
  })

  test(`${channel} a new line after a reorder is max + 1`, () => {
    const reordered = keepLineIdsOnReorder(
      [
        { name: "c", line_item: 9, line_item_id: id(9), lineItemId: id(9) },
        { name: "a", line_item: 4, line_item_id: id(4), lineItemId: id(4) },
      ],
      MBA,
      code,
    )
    const added = nextLineFields(reordered, MBA, code)
    assert.equal(added.line_item, 10)
    assert.equal(added.line_item_id, id(10))
  })

  test(`${channel} duplicate after a reorder keeps the source id and mints max + 1`, () => {
    const reordered = keepLineIdsOnReorder(
      [
        { name: "c", line_item: 9, line_item_id: id(9), lineItemId: id(9) },
        { name: "a", line_item: 4, line_item_id: id(4), lineItemId: id(4) },
      ],
      MBA,
      code,
    )
    const sourceId = reordered[0]!.line_item_id
    const copy = nextLineFields(reordered, MBA, code)
    assert.equal(reordered[0]!.line_item_id, sourceId)
    assert.equal(sourceId, id(9))
    assert.equal(copy.line_item_id, id(10))
    assert.notEqual(copy.line_item_id, sourceId)
  })

  test(`${channel} save, reload, re-save keeps ids and positions`, () => {
    const saved = keepLineIdsOnReorder(
      [
        { name: "c", line_item: 9, line_item_id: id(9), lineItemId: id(9) },
        { name: "a", line_item: 4, line_item_id: id(4), lineItemId: id(4) },
        { name: "b", line_item: 7, line_item_id: id(7), lineItemId: id(7) },
      ],
      MBA,
      code,
    )
    const persisted = saved.map((line) => ({
      ...line,
      line_item: line.position,
      lineItem: line.position,
    }))
    const loaded = prepareEditorLines(persisted, MBA, code)
    assert.deepEqual(
      loaded.map((line) => line.line_item_id),
      [id(9), id(4), id(7)],
    )
    assert.deepEqual(
      loaded.map((line) => line.position),
      [0, 1, 2],
    )
    const resaved = keepLineIdsOnReorder(loaded, MBA, code)
    assert.deepEqual(
      resaved.map((line) => line.line_item_id),
      loaded.map((line) => line.line_item_id),
    )
    assert.deepEqual(
      resaved.map((line) => line.position),
      loaded.map((line) => line.position),
    )
  })

  test(`${channel} expert apply keeps updated ids and mints max + 1 for a new row`, () => {
    const applied = keepLineIdsOnReorder(
      stripUnmintedLineIdentity([
        { name: "kept", line_item: 1, line_item_id: id(9), lineItemId: id(9) },
        { name: "new", line_item: 2, line_item_id: "2", lineItemId: "2" },
      ]),
      MBA,
      code,
    )
    assert.equal(applied[0]!.line_item_id, id(9))
    assert.equal(applied[1]!.line_item_id, id(10))
  })
}
