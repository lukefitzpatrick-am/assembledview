/**
 * AV-SF1 — browser-draft campaign dates must survive JSON (UTC ISO) and
 * come back as the civil day the picker showed.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { isValidPickerDate } from "../../../date-picker-anchor.js"
import type { PlanDraftStateV1 } from "../types.js"
import { diffDraftAgainstBase } from "../fieldDiff.js"
import { restoreDraftFormValues } from "../campaignDraftDates.js"

function civil(value: unknown): string {
  assert.ok(value instanceof Date, `expected a Date, got ${typeof value} ${String(value)}`)
  assert.equal(isValidPickerDate(value), true)
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, "0")
  const d = String(value.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Same boundary as export JSON and server draft jsonb: Date → UTC ISO string. */
function serialiseForm(formValues: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(formValues)) as Record<string, unknown>
}

function state(formValues: Record<string, unknown>): PlanDraftStateV1 {
  return {
    v: 1,
    mbaNumber: "krusty002",
    masterId: 1,
    baseVersionId: 1,
    formValues,
    channels: {},
    meta: { lineCount: 0, budgetCents: 0 },
  }
}

describe("browser-draft campaign dates", () => {
  it("round-trips 15 Nov 2026 and 20 Dec 2026 through serialise then restore", () => {
    const start = new Date(2026, 10, 15)
    const end = new Date(2026, 11, 20)
    const stored = serialiseForm({
      mp_campaigndates_start: start,
      mp_campaigndates_end: end,
    })
    const restored = restoreDraftFormValues(stored)
    assert.equal(civil(restored.mp_campaigndates_start), "2026-11-15")
    assert.equal(civil(restored.mp_campaigndates_end), "2026-12-20")
  })

  it("lists only a budget change when the dates were not edited", () => {
    const start = new Date(2026, 10, 15)
    const end = new Date(2026, 11, 20)
    const baseValues = {
      mp_campaigndates_start: start,
      mp_campaigndates_end: end,
      mp_campaignbudget: 1000,
      mp_ponumber: "PO-1",
    }
    const restored = restoreDraftFormValues(serialiseForm(baseValues))
    restored.mp_campaignbudget = 2500
    const diff = diffDraftAgainstBase(state(baseValues), state(restored))
    assert.deepEqual(
      diff.campaignChanges.map((change) => change.fieldPath),
      ["mp_campaignbudget"],
    )
    assert.equal(diff.changeCount, 1)
  })
})
