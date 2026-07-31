/**
 * Publish-branch payload fixture: 2-line single-channel campaign must keep
 * distinct stable line_item_ids + correct mode/versionNumber for draft→booked on v1.
 * A1 draft overwrite fixture stays green via resolvePostgresSaveMode draft path.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { buildSavePlanLineItemsFromSnapshots } from "../buildPostgresSavePayload"
import { formatSaveModeLabel } from "../channelHydrationGate"
import { MEDIA_TYPE_ID_CODES } from "../lineItemIds"
import { assignStableLineItemNumbers, reassignLineItemNumbers } from "../lineItemOrder"
import { resolvePostgresSaveMode } from "../resolvePostgresSaveMode"

const MBA = "krusty015"

function socialRow(id: string, lineNo: number, over: Record<string, unknown> = {}) {
  return {
    line_item_id: id,
    lineItemId: id,
    line_item: lineNo,
    lineItem: lineNo,
    platform: lineNo === 1 ? "Meta" : "TikTok",
    buy_type: "cpm",
    market: "AU",
    bursts: [
      {
        budget: "1000",
        buyAmount: "10",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      },
    ],
    ...over,
  }
}

describe("publish-branch postgres save payload (2-line social)", () => {
  it("keeps distinct SM1+SM2 when assembling from stable ids (not positional re-derive)", () => {
    const grid = [
      socialRow(`${MBA}SM1`, 1),
      socialRow(`${MBA}SM2`, 2),
    ]
    // Law: minted at creation, never re-derived from row order on save.
    const stamped = assignStableLineItemNumbers(
      grid,
      MBA,
      MEDIA_TYPE_ID_CODES.socialMedia
    )
    const lineItems = buildSavePlanLineItemsFromSnapshots({
      socialMedia: stamped,
    })

    assert.deepEqual(
      lineItems.map((l) => l.lineItemId),
      [`${MBA}SM1`, `${MBA}SM2`]
    )
    assert.equal(new Set(lineItems.map((l) => l.lineItemId)).size, 2)
  })

  it("draft→booked on v1: mode publish + versionNumber 2 + label Will create v2", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Booked",
      forceIncrement: false,
      publishedVersionNumber: 1,
      // Same lazy-empty history the edit footer/save path can see.
      versionRowCount: 0,
    })
    assert.equal(mode.mode, "publish")
    assert.equal(mode.versionNumber, 2)
    assert.equal(mode.uiMode, "increment")
    assert.equal(formatSaveModeLabel(mode.uiMode, mode.versionNumber), "Will create v2")
  })

  it("A1 draft overwrite fixture stays green (in-place v1)", () => {
    const mode = resolvePostgresSaveMode({
      campaignStatus: "Draft",
      forceIncrement: false,
      publishedVersionNumber: 1,
      versionRowCount: 0,
    })
    assert.deepEqual(mode, {
      mode: "draft",
      versionNumber: 1,
      uiMode: "overwrite",
    })
    assert.equal(
      formatSaveModeLabel(mode.uiMode, mode.versionNumber),
      "Draft — overwrites v1"
    )
  })

  it("positional reassign is NOT the save contract (would mask identity bugs)", () => {
    // If SM2 is ordered first, reassign would stamp it SM1 — forbidden on save.
    const reordered = [
      socialRow(`${MBA}SM2`, 2),
      socialRow(`${MBA}SM1`, 1),
    ]
    const reassigned = reassignLineItemNumbers(
      reordered,
      MBA,
      MEDIA_TYPE_ID_CODES.socialMedia
    )
    assert.deepEqual(
      reassigned.map((r) => r.line_item_id),
      [`${MBA}SM1`, `${MBA}SM2`],
      "reassign rewrites by index — must not be used on postgres save"
    )
    const stable = assignStableLineItemNumbers(
      reordered,
      MBA,
      MEDIA_TYPE_ID_CODES.socialMedia
    )
    assert.deepEqual(
      stable.map((r) => r.line_item_id),
      [`${MBA}SM2`, `${MBA}SM1`]
    )
  })
})
