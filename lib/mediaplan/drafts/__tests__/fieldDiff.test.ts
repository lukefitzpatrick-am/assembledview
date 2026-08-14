import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { PlanDraftStateV1 } from "../types.js"
import {
  classifyDraftLoad,
  diffDraftAgainstBase,
  formatDraftFieldWas,
  formatDraftRelativeTime,
  getLineItemId,
  isDraftFieldChanged,
  lineItemLabel,
  valuesEqualForDraftDiff,
} from "../fieldDiff.js"

function state(
  over: Partial<PlanDraftStateV1> & { channels: PlanDraftStateV1["channels"] },
): PlanDraftStateV1 {
  return {
    v: 1,
    mbaNumber: "glenda006",
    masterId: 1,
    baseVersionId: 4347,
    formValues: {},
    meta: { lineCount: 0, budgetCents: 0 },
    ...over,
  }
}

describe("classifyDraftLoad", () => {
  it("auto-applies when draft baseVersionId equals the current tip id", () => {
    assert.equal(
      classifyDraftLoad({ hasDraft: true, draftBaseVersionId: 4347, tipVersionId: 4347 }),
      "auto",
    )
  })

  it("is stale when a draft exists but base !== tip", () => {
    assert.equal(
      classifyDraftLoad({ hasDraft: true, draftBaseVersionId: 4347, tipVersionId: 4401 }),
      "stale",
    )
  })

  it("is none when there is no draft", () => {
    assert.equal(
      classifyDraftLoad({ hasDraft: false, draftBaseVersionId: undefined, tipVersionId: 4347 }),
      "none",
    )
  })

  it("waits when the tip id has not loaded yet", () => {
    assert.equal(
      classifyDraftLoad({ hasDraft: true, draftBaseVersionId: 4347, tipVersionId: null }),
      "pending",
    )
  })
})

describe("valuesEqualForDraftDiff", () => {
  it("treats formatted money and numeric money as equal", () => {
    assert.equal(valuesEqualForDraftDiff("$20,000.00", 20000, "money"), true)
    assert.equal(valuesEqualForDraftDiff("$20,000.00", "20000", "money"), true)
    assert.equal(valuesEqualForDraftDiff("$20,000.00", "$15,000.00", "money"), false)
  })

  it("normalises dates to the calendar day", () => {
    assert.equal(
      valuesEqualForDraftDiff("2026-07-01", new Date("2026-07-01T00:00:00"), "date"),
      true,
    )
    assert.equal(valuesEqualForDraftDiff("2026-07-01", "2026-07-02", "date"), false)
  })
})

describe("formatDraftFieldWas", () => {
  it("formats money with $ and dates with the app date format", () => {
    assert.equal(formatDraftFieldWas(20000, "money"), "$20,000.00")
    assert.match(formatDraftFieldWas("2026-07-01", "date"), /1 Jul 2026|1 July 2026/)
  })
})

describe("diffDraftAgainstBase", () => {
  const base = state({
    channels: {
      search: [
        {
          line_item_id: "glenda006-se1",
          platform: "Google",
          bursts: [{ budget: "$25,000.00", startDate: "2026-07-01", endDate: "2026-07-31" }],
        },
        {
          line_item_id: "glenda006-se2",
          platform: "Bing",
          bursts: [{ budget: "$5,000.00" }],
        },
      ],
    },
  })

  it("flags an edited burst budget with the old value, and clears when reverted", () => {
    const edited = state({
      channels: {
        search: [
          {
            line_item_id: "glenda006-se1",
            platform: "Google",
            bursts: [{ budget: "$20,000.00", startDate: "2026-07-01", endDate: "2026-07-31" }],
          },
          {
            line_item_id: "glenda006-se2",
            platform: "Bing",
            bursts: [{ budget: "$5,000.00" }],
          },
        ],
      },
    })
    const diff = diffDraftAgainstBase(base, edited)
    assert.equal(diff.changeCount, 1)
    assert.equal(diff.fieldChanges.length, 1)
    assert.equal(diff.fieldChanges[0].lineItemId, "glenda006-se1")
    assert.equal(diff.fieldChanges[0].fieldPath, "bursts.0.budget")
    assert.equal(diff.fieldChanges[0].wasFormatted, "$25,000.00")
    assert.equal(
      isDraftFieldChanged(base, "glenda006-se1", "bursts.0.budget", "$20,000.00"),
      true,
    )
    assert.equal(
      isDraftFieldChanged(base, "glenda006-se1", "bursts.0.budget", "$25,000.00"),
      false,
    )
  })

  it("flags added lines and lists deleted lines with labels; N = fields + added + removed", () => {
    const current = state({
      channels: {
        search: [
          {
            line_item_id: "glenda006-se1",
            platform: "Google",
            bursts: [{ budget: "$25,000.00", startDate: "2026-07-01", endDate: "2026-07-31" }],
          },
          {
            line_item_id: "glenda006-se3",
            platform: "Meta",
            bursts: [{ budget: "$1,000.00" }],
          },
        ],
      },
    })
    const diff = diffDraftAgainstBase(base, current)
    assert.deepEqual(diff.addedLineIds, ["glenda006-se3"])
    assert.equal(diff.removedLines.length, 1)
    assert.equal(diff.removedLines[0].lineItemId, "glenda006-se2")
    assert.match(diff.removedLines[0].label, /Bing/)
    assert.equal(diff.changeCount, 2)
  })
})

describe("line helpers", () => {
  it("reads line_item_id or lineItemId and a publisher/platform label", () => {
    assert.equal(getLineItemId({ lineItemId: "x-se1" }), "x-se1")
    assert.equal(lineItemLabel({ line_item_id: "x-se2", publisher: "Nine" }), "Nine")
  })
})

describe("formatDraftRelativeTime", () => {
  it("renders a compact relative phrase", () => {
    const now = Date.parse("2026-08-14T12:00:00.000Z")
    assert.equal(formatDraftRelativeTime("2026-08-14T11:00:00.000Z", now), "1h ago")
    assert.equal(formatDraftRelativeTime("2026-08-13T12:00:00.000Z", now), "yesterday")
  })
})
