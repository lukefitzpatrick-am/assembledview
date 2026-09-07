import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { PlanDraftStateV1 } from "../types.js"
import {
  classifyDraftLoad,
  diffDraftAgainstBase,
  draftDiffBreakdown,
  formatDraftFieldWas,
  formatDraftMoneyDelta,
  formatDraftRelativeTime,
  getLineItemId,
  groupDraftDiff,
  isDraftFieldChanged,
  lineItemLabel,
  removedLineCaption,
  valuesEqualForDraftDiff,
} from "../fieldDiff.js"
import { CAMPAIGN_DRAFT_LINE_ID } from "../fieldLabels.js"

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
    assert.equal(diff.addedLines[0]?.label, "Meta")
    assert.equal(removedLineCaption(diff.removedLines[0]!), "Removed: Bing")
    assert.equal(diff.removedLines[0]!.lineItemId.includes("se2"), true)
  })

  it("campaign budget change is one campaignChanges row, money-formatted, no channel rows", () => {
    const campaignBase = state({
      formValues: { mp_campaignbudget: 20000 },
      channels: {
        search: [
          {
            line_item_id: "glenda006-se1",
            platform: "Google",
            bursts: [{ budget: "$25,000.00" }],
          },
        ],
      },
    })
    const edited = state({
      formValues: { mp_campaignbudget: 22500 },
      channels: campaignBase.channels,
    })
    const diff = diffDraftAgainstBase(campaignBase, edited)
    assert.equal(diff.fieldChanges.length, 0)
    assert.equal(diff.campaignChanges.length, 1)
    assert.equal(diff.campaignChanges[0]!.lineItemId, CAMPAIGN_DRAFT_LINE_ID)
    assert.equal(diff.campaignChanges[0]!.fieldPath, "mp_campaignbudget")
    assert.equal(diff.campaignChanges[0]!.kind, "money")
    assert.equal(diff.campaignChanges[0]!.wasFormatted, "$20,000.00")
    assert.equal(
      formatDraftFieldWas(diff.campaignChanges[0]!.newValue, "money"),
      "$22,500.00",
    )
    assert.equal(formatDraftMoneyDelta(2500), "+$2,500")
    const grouped = groupDraftDiff(diff)
    assert.equal(grouped.channels.length, 0)
    assert.equal(grouped.campaign.length, 1)
    const rows = draftDiffBreakdown(diff)
    assert.equal(rows[0]!.label, "Campaign")
    assert.equal(rows[0]!.count, 1)
    assert.equal(rows[0]!.moneyDeltaLabel, "+$2,500")
  })

  it("two channels edited group as one block per line", () => {
    const twoBase = state({
      channels: {
        search: [
          {
            line_item_id: "glenda006-se1",
            platform: "Google",
            bursts: [{ budget: "$25,000.00" }],
          },
        ],
        socialMedia: [
          {
            line_item_id: "glenda006-so1",
            platform: "Meta",
            bursts: [{ budget: "$10,000.00" }],
          },
        ],
      },
    })
    const edited = state({
      channels: {
        search: [
          {
            line_item_id: "glenda006-se1",
            platform: "Google",
            bursts: [{ budget: "$20,000.00" }],
          },
        ],
        socialMedia: [
          {
            line_item_id: "glenda006-so1",
            platform: "Meta",
            bursts: [{ budget: "$12,000.00" }],
          },
        ],
      },
    })
    const diff = diffDraftAgainstBase(twoBase, edited)
    const grouped = groupDraftDiff(diff)
    assert.equal(grouped.campaign.length, 0)
    assert.equal(grouped.channels.length, 2)
    assert.equal(grouped.channels[0]!.channel, "search")
    assert.equal(grouped.channels[0]!.channelLabel, "Search")
    assert.equal(grouped.channels[0]!.lines.length, 1)
    assert.equal(grouped.channels[0]!.lines[0]!.label, "Google")
    assert.equal(grouped.channels[1]!.channel, "socialMedia")
    assert.equal(grouped.channels[1]!.channelLabel, "Social")
    assert.equal(grouped.channels[1]!.lines.length, 1)
    assert.equal(grouped.channels[1]!.lines[0]!.label, "Meta")
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
