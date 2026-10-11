import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  emptyLinesRemovedNotice,
  isEmptyLineResume,
  removedEmptyLineUpdates,
  stripEmptyLinesOnPublish,
  stripEmptyLineItems,
  type EmptyLineFields,
} from "../stripEmptyLineItems"

const SAVE_ROUTE = "app/api/plans/save/route.ts"
const CREATE_PAGE = "app/mediaplans/create/page.tsx"
const EDIT_PAGE = "app/mediaplans/mba/[mba_number]/edit/page.tsx"

function line(
  id: string,
  extras: {
    channel?: string
    buyType?: string | null
    bursts?: Array<Record<string, unknown>>
  } = {},
) {
  return {
    lineItemId: id,
    channel: extras.channel ?? "radio",
    buyType: extras.buyType === undefined ? null : extras.buyType,
    bursts: extras.bursts ?? [
      { budget: "", buyAmount: "", calculatedValue: null },
    ],
  }
}

describe("stripEmptyLineItems", () => {
  it("strips an empty line and keeps a budget with no buy type", () => {
    const empty = line("krusty002RA1")
    const budget = line("krusty002RA2", {
      bursts: [{ budget: "$1,000.00", buyAmount: "", calculatedValue: 0 }],
    })
    const result = stripEmptyLineItems([empty, budget])
    assert.deepEqual(result.kept.map((row) => row.lineItemId), ["krusty002RA2"])
    assert.deepEqual(result.removedIds, ["krusty002RA1"])
  })

  it("keeps a rate-only line", () => {
    const rate = line("krusty002RA3", {
      bursts: [{ budget: "", buyAmount: "$12.50", calculatedValue: 0 }],
    })
    const result = stripEmptyLineItems([rate])
    assert.equal(result.kept.length, 1)
    assert.deepEqual(result.removedIds, [])
  })

  it("strips an empty production line and treats $0.00 as empty", () => {
    const production = line("krusty002PROD1", {
      channel: "production",
      buyType: "production",
      bursts: [{ budget: "$0.00", buyAmount: "", calculatedValue: null }],
    })
    const real = line("krusty002RA4", {
      buyType: "cpm",
      bursts: [{ budget: 100, buyAmount: 10, calculatedValue: 1 }],
    })
    const result = stripEmptyLineItems([production, real])
    assert.deepEqual(result.removedIds, ["krusty002PROD1"])
    assert.deepEqual(result.kept.map((row) => row.lineItemId), ["krusty002RA4"])
  })

  it("strips nothing when every line is empty", () => {
    const lines = [line("krusty002RA1"), line("krusty002RA2")]
    const result = stripEmptyLineItems(lines)
    assert.equal(result.kept, lines)
    assert.deepEqual(result.removedIds, [])
  })
})

describe("stripEmptyLinesOnPublish", () => {
  it("saves the real line and returns the three empty ids", () => {
    const lines = [
      line("krusty002RA1"),
      line("krusty002RA2", {
        bursts: [{ budget: "$0.00", buyAmount: 0, calculatedValue: "" }],
      }),
      line("krusty002RA3"),
      line("krusty002TV1", {
        channel: "television",
        buyType: "spot",
        bursts: [{ budget: "$1,000.00", buyAmount: "100", calculatedValue: 10 }],
      }),
    ]
    const result = stripEmptyLinesOnPublish("publish", lines)
    assert.equal(result.lineItems.length, 1)
    assert.equal(result.lineItems[0]?.lineItemId, "krusty002TV1")
    assert.deepEqual(result.removedIds, [
      "krusty002RA1",
      "krusty002RA2",
      "krusty002RA3",
    ])
  })

  it("strips nothing when every line is empty", () => {
    const lines = [line("krusty002RA1"), line("krusty002RA2"), line("krusty002RA3")]
    const result = stripEmptyLinesOnPublish("publish", lines)
    assert.equal(result.lineItems, lines)
    assert.equal(result.lineItems.length, 3)
    assert.deepEqual(result.removedIds, [])
  })

  it("keeps every line on draft and new_version", () => {
    const lines = [line("krusty002RA1"), line("krusty002TV1", { buyType: "spot", bursts: [{ budget: 10, buyAmount: 1, calculatedValue: 1 }] })]
    for (const mode of ["draft", "new_version"] as const) {
      const result = stripEmptyLinesOnPublish(mode, lines)
      assert.equal(result.lineItems, lines)
      assert.deepEqual(result.removedIds, [])
    }
  })

  it("route runs the strip after deliverable rounding and before the buy-type gate", () => {
    const src = readFileSync(SAVE_ROUTE, "utf8")
    const normaliseIdx = src.indexOf("normaliseSaveLineDeliverables(body.lineItems)")
    const stripIdx = src.indexOf("stripEmptyLinesOnPublish(body.mode, body.lineItems)")
    const assignIdx = src.indexOf("body.lineItems = strippedPublish.lineItems")
    const gateIdx = src.indexOf("missingBuyTypeGateResult(body.mode")
    const saveIdx = src.indexOf("savePlanVersion(")
    assert.ok(normaliseIdx >= 0)
    assert.ok(stripIdx > normaliseIdx)
    assert.ok(assignIdx > stripIdx)
    assert.ok(gateIdx > assignIdx)
    assert.ok(saveIdx > gateIdx)
    assert.match(src, /removedIds: strippedPublish\.removedIds/)
  })
})

describe("editor removed ids", () => {
  it("drops empty lines, keeps a line filled during the save, and leaves the next payload without the removed lines", () => {
    const filledDuringSave: EmptyLineFields = {
      line_item_id: "krusty002RA2",
      buy_type: null,
      bursts: [{ budget: "$50.00", buyAmount: "", calculatedValue: 0 }],
    }
    const radio: EmptyLineFields[] = [
      {
        line_item_id: "krusty002RA1",
        buy_type: "  ",
        bursts: [{ budget: "", buyAmount: null, calculatedValue: "" }],
      },
      filledDuringSave,
    ]
    const television: EmptyLineFields[] = [
      {
        line_item_id: "krusty002TV1",
        buy_type: "spot",
        bursts: [{ budget: 100, buyAmount: 10, calculatedValue: 1 }],
      },
    ]
    const { updates, removedCount } = removedEmptyLineUpdates(
      [
        { key: "radio", lines: radio },
        { key: "television", lines: television },
      ],
      ["krusty002RA1", "krusty002RA2"],
    )
    assert.equal(removedCount, 1)
    assert.equal(updates.length, 1)
    assert.equal(updates[0]?.key, "radio")
    assert.deepEqual(
      updates[0]?.lines.map((row) => row.line_item_id),
      ["krusty002RA2"],
    )
    assert.equal(emptyLinesRemovedNotice(removedCount), "Removed 1 empty lines with no buy type, budget, or rate.")
    const nextPayload = [
      ...(updates.find((update) => update.key === "radio")?.lines ?? radio),
      ...television,
    ]
    assert.deepEqual(
      nextPayload.map((row) => row.line_item_id),
      ["krusty002RA2", "krusty002TV1"],
    )
  })

  it("marks an emptied channel so the first empty initialLineItems hydrates", () => {
    const only = [
      {
        line_item_id: "krusty002RA9",
        buyType: null,
        bursts: [{ budget: "$0.00", buyAmount: "", calculatedValue: 0 }],
      },
    ]
    const { updates } = removedEmptyLineUpdates(
      [{ key: "radio", lines: only }],
      ["krusty002RA9"],
    )
    assert.equal(updates[0]?.lines.length, 0)
    assert.equal(isEmptyLineResume(updates[0]!.lines), true)
  })

  it("create and edit toast the removed count and only replace affected containers", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    for (const src of [createSrc, editSrc]) {
      assert.match(src, /removedEmptyLineUpdates\(/)
      assert.match(src, /emptyLinesRemovedNotice\(removedCount\)/)
      assert.match(src, /saveResult\.data\.removedIds/)
    }
    assert.match(createSrc, /emptyLineResume/)
    assert.match(createSrc, /initialLineItems=\{emptyLineResume\.television\}/)
    assert.match(editSrc, /initial: setTelevisionLineItems/)
    assert.match(editSrc, /writer\.initial\?\.\(next\)/)
  })
})
