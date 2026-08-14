/**
 * SMK-1 — Resume must restore the full draft (every channel + bursts)
 * after tip hydration, including deleted lines (empty arrays).
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { PlanDraftStateV1 } from "../types.js"
import {
  buildDraftChannelApply,
  clickResume,
  flushWhenHydrationSettled,
  initialPlanDraftRestoreGate,
  shouldApplyTipLineItems,
} from "../applyRestore.js"

function draft(over: Partial<PlanDraftStateV1>["channels"]): PlanDraftStateV1 {
  return {
    v: 1,
    mbaNumber: "glenda006",
    masterId: 1,
    baseVersionId: 4347,
    formValues: { mp_campaignbudget: 20000 },
    channels: {
      search: [
        {
          line_item_id: "glenda006-se1",
          bursts: [{ budget: "$20,000.00", startDate: "2026-07-01", endDate: "2026-07-31" }],
        },
      ],
      television: [],
      ...over,
    },
    meta: { lineCount: 1, budgetCents: 2_000_000 },
  }
}

describe("buildDraftChannelApply", () => {
  it("round-trip: edited burst is present on both hydration and media bags", () => {
    const { hydration, media } = buildDraftChannelApply(draft({}).channels)
    assert.equal(
      (hydration.search[0] as { bursts: { budget: string }[] }).bursts[0].budget,
      "$20,000.00",
    )
    assert.equal(
      (media.search[0] as { bursts: { budget: string }[] }).bursts[0].budget,
      "$20,000.00",
    )
    assert.notEqual(hydration.search, media.search)
  })

  it("deleted line: empty channel arrays are applied, not skipped", () => {
    const { hydration, media } = buildDraftChannelApply(
      draft({ search: [], television: [{ line_item_id: "keep" }] }).channels,
    )
    assert.deepEqual(hydration.search, [])
    assert.deepEqual(media.search, [])
    assert.equal(hydration.television.length, 1)
  })

  it("omits keys that were never in the snapshot", () => {
    const { hydration } = buildDraftChannelApply({ search: [] })
    assert.equal("radio" in hydration, false)
    assert.equal("search" in hydration, true)
  })
})

describe("resume gate vs tip hydration", () => {
  it("queues restore until hydration settles, then applies once", () => {
    let gate = initialPlanDraftRestoreGate()
    assert.equal(shouldApplyTipLineItems(gate), true)

    const state = draft({})
    const clicked = clickResume(gate, state, false)
    gate = clicked.gate
    assert.equal(clicked.apply, null)
    assert.equal(shouldApplyTipLineItems(gate), true)

    const flushed = flushWhenHydrationSettled(gate, true)
    gate = flushed.gate
    assert.equal(flushed.apply, state)
    assert.equal(gate.applied, true)
    assert.equal(shouldApplyTipLineItems(gate), false)
  })

  it("applies immediately when hydration already settled", () => {
    const state = draft({})
    const clicked = clickResume(initialPlanDraftRestoreGate(), state, true)
    assert.equal(clicked.apply, state)
    assert.equal(clicked.gate.applied, true)
    assert.equal(shouldApplyTipLineItems(clicked.gate), false)
  })

  it("does not re-apply on later settle ticks", () => {
    const applied = clickResume(initialPlanDraftRestoreGate(), draft({}), true).gate
    const again = flushWhenHydrationSettled(applied, true)
    assert.equal(again.apply, null)
    assert.equal(again.gate.applied, true)
  })

  it("Discard resets the gate so tip writes are allowed again", () => {
    const applied = clickResume(initialPlanDraftRestoreGate(), draft({}), true).gate
    assert.equal(shouldApplyTipLineItems(applied), false)
    const afterDiscard = initialPlanDraftRestoreGate()
    assert.equal(shouldApplyTipLineItems(afterDiscard), true)
  })
})
