import assert from "node:assert/strict"
import test from "node:test"

import { attachOverridesToLineInputs } from "../billingOverrides.js"
import { computeBillingInputsHash } from "../computeBillingInputsHash.js"
import { recomputeAndValidateBillingScheduleOnSave } from "../recomputeBillingScheduleOnSave.js"
import type { LineItemInput } from "../campaignFinancials.types.js"

function searchLine(overrides?: Partial<LineItemInput>): LineItemInput {
  return {
    lineItemId: "S-1",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 10_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 20,
    bursts: [
      {
        startDate: "2026-06-01",
        endDate: "2026-07-31",
        budget: 10_000,
        buyAmount: 1,
      },
    ],
    approval: "approved",
    ...overrides,
  }
}

test("attachOverridesToLineInputs: media + fee rows map onto line inputs", () => {
  const lines = attachOverridesToLineInputs([searchLine()], [
    {
      line_item_id: "S-1",
      component: "media",
      mode: "manual",
      reason: "prepayment",
      date_basis: "basis",
      months: [{ month: "2026-06", amount: 10_000 }],
    },
    {
      line_item_id: "S-1",
      component: "fee",
      mode: "manual",
      months: [{ month: "2026-06", amount: 2000 }],
      date_basis: "basis",
    },
  ])
  assert.equal(lines[0]!.billingOverride?.mode, "manual")
  assert.equal(lines[0]!.billingOverride?.months[0]!.amount, 10_000)
  assert.equal(lines[0]!.feeOverride?.mode, "manual")
  assert.equal(lines[0]!.feeOverride?.months[0]!.amount, 2000)
})

test("omit client schedule → generate from recompute; inputs_hash set; rebill_needed false", () => {
  const result = recomputeAndValidateBillingScheduleOnSave({
    lineItems: [searchLine()],
    feeLoading: {},
    clientBillingSchedule: null,
    overrideRows: [],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.ok(result.billingSchedule.length >= 1, "never store null/empty when computable")
  assert.equal(result.rebill_needed, false)
  assert.equal(result.generatedFromServer, true)
  assert.equal(result.inputs_hash, computeBillingInputsHash([searchLine()]))
  assert.match(result.inputs_hash, /^[a-f0-9]{64}$/)
})

test("stale AUTO fee schedule (krusty-style) → 409 with totalDelta", () => {
  // Fresh recompute: media 10k + fee 2k @ 20%.
  const fresh = recomputeAndValidateBillingScheduleOnSave({
    lineItems: [searchLine()],
    feeLoading: {},
    clientBillingSchedule: null,
    overrideRows: [],
  })
  assert.equal(fresh.ok, true)
  if (!fresh.ok) return

  // Stale client schedule: same media, understated fee ($1,200 vs $2,000).
  const stale = fresh.billingSchedule.map((m) => ({
    ...m,
    mediaCosts: { ...m.mediaCosts },
    feeTotal: "$600.00", // two months → $1,200 total vs $2,000
  }))

  const result = recomputeAndValidateBillingScheduleOnSave({
    lineItems: [searchLine()],
    feeLoading: {},
    clientBillingSchedule: stale,
    overrideRows: [],
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.equal(result.body.code, "BILLING_SCHEDULE_DIVERGENCE")
  assert.ok(result.body.delta)
  assert.ok(Math.abs(result.body.delta!.totalDeltaExGst) > 0.01)
  assert.ok(
    typeof result.body.userMessage === "string" && result.body.userMessage.includes("ex GST"),
    "divergence body should include human userMessage"
  )
})

test("matching AUTO schedule passes; rebill_needed false", () => {
  const generated = recomputeAndValidateBillingScheduleOnSave({
    lineItems: [searchLine()],
    feeLoading: {},
    clientBillingSchedule: null,
    overrideRows: [],
  })
  assert.equal(generated.ok, true)
  if (!generated.ok) return

  const result = recomputeAndValidateBillingScheduleOnSave({
    lineItems: [searchLine()],
    feeLoading: {},
    clientBillingSchedule: generated.billingSchedule,
    overrideRows: [],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.rebill_needed, false)
  assert.equal(result.generatedFromServer, false)
})

test("manual media override that fails sum rule → 409 sumViolations (C2 gate)", () => {
  const result = recomputeAndValidateBillingScheduleOnSave({
    lineItems: [
      searchLine({
        label: "Google Search — Brand",
        billingOverride: {
          mode: "manual",
          reason: "manual",
          dateBasis: "x",
          // Does not equal $10,000 media
          months: [{ month: "2026-06", amount: 1 }],
        },
      }),
    ],
    feeLoading: {},
    clientBillingSchedule: null,
    overrideRows: [],
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.status, 409)
  assert.equal(result.body.code, "BILLING_OVERRIDE_SUM_VIOLATION")
  assert.ok((result.body.sumViolations?.length ?? 0) >= 1)
  const msg = result.body.sumViolations![0].message
  assert.ok(msg.includes("Google Search — Brand"), `label in message: ${msg}`)
  assert.ok(msg.includes("manual months add to"), `human sum copy: ${msg}`)
  assert.ok(msg.includes("off by"), `delta in message: ${msg}`)
})
