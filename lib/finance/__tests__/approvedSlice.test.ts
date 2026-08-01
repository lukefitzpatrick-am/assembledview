/**
 * PC2 — approved slice + full-scope C1 gate goldens.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { computeCampaignFinancials } from "../computeCampaignFinancials.js"
import type { LineItemInput } from "../campaignFinancials.types.js"
import { computeApprovedSlice } from "../approvedSlice.js"
import {
  evaluateFullScopeGate,
  getSaveGateFullScopeMode,
  sumBillingScheduleFullScopeCents,
} from "../fullScopeGate.js"
import { explodeScheduleToMonthRows } from "../../../scripts/migration/_scheduleTransform.js"

function fixture(overrides?: {
  excludeSocial?: boolean
  clientPays?: boolean
  selectedMonths?: string[]
}): LineItemInput[] {
  return [
    {
      lineItemId: "billing-search::PC2SEA001",
      mediaType: "search",
      buyType: "cpc",
      rate: 2,
      enteredAmount: 10_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 20,
      label: "Google",
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-06-30",
          budget: 10_000,
          buyAmount: 2,
        },
      ],
      approval: "approved",
    },
    {
      lineItemId: "billing-progDisplay::PC2PD001",
      mediaType: "progDisplay",
      buyType: "cpm",
      rate: 10,
      enteredAmount: 5_000,
      budgetIncludesFees: false,
      clientPaysForMedia: overrides?.clientPays === true,
      feePct: 15,
      label: "DV360",
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-05-31",
          budget: 5_000,
          buyAmount: 10,
          deliverables: 500_000,
        },
      ],
      approval: "approved",
    },
    {
      lineItemId: "billing-production::PC2PRD001",
      mediaType: "production",
      buyType: "fixed_cost",
      rate: 0,
      enteredAmount: 1_200,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 0,
      label: "Assets",
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-05-31",
          budget: 1_200,
        },
      ],
      approval: "approved",
    },
    {
      lineItemId: "billing-socialMedia::PC2SOC001",
      mediaType: "socialMedia",
      buyType: "cpm",
      rate: 8,
      enteredAmount: 4_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 10,
      label: "Meta",
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-06-30",
          budget: 4_000,
          buyAmount: 8,
        },
      ],
      approval: overrides?.excludeSocial ? "excluded" : "approved",
    },
  ]
}

test("getSaveGateFullScopeMode defaults to off", () => {
  const prev = process.env.SAVE_GATE_FULL_SCOPE
  delete process.env.SAVE_GATE_FULL_SCOPE
  try {
    assert.equal(getSaveGateFullScopeMode(), "off")
  } finally {
    if (prev === undefined) delete process.env.SAVE_GATE_FULL_SCOPE
    else process.env.SAVE_GATE_FULL_SCOPE = prev
  }
})

test("slice: partial approval excludes social line", () => {
  const financials = computeCampaignFinancials(fixture({ excludeSocial: true }), {
    feeLoading: {},
  })
  const slice = computeApprovedSlice({ financials })
  assert.ok(slice.totalCents > 0)
  assert.ok(!slice.lines.some((l) => l.lineItemId.includes("SOC001")))
  assert.ok(slice.lines.some((l) => l.lineItemId.includes("SEA001")))
  assert.ok(slice.lines.some((l) => l.lineItemId.includes("PRD001")))
  const prd = slice.lines.find((l) => l.lineItemId.includes("PRD001"))!
  assert.ok(prd.productionCents > 0)
  assert.equal(prd.mediaCents, 0)
})

test("slice: incremental month chips (May only)", () => {
  const financials = computeCampaignFinancials(fixture(), { feeLoading: {} })
  const full = computeApprovedSlice({ financials })
  const mayOnly = computeApprovedSlice({
    financials,
    selectedMonthYears: ["May 2026"],
  })
  assert.ok(mayOnly.totalCents > 0)
  assert.ok(mayOnly.totalCents < full.totalCents)
  for (const line of mayOnly.lines) {
    assert.ok(line.months.every((m) => m === "2026-05" || m.startsWith("2026-05")))
  }
})

test("slice: amendment down (approve only search)", () => {
  const financials = computeCampaignFinancials(fixture(), { feeLoading: {} })
  const slice = computeApprovedSlice({
    financials,
    approvedLineItemIds: ["billing-search::PC2SEA001"],
  })
  assert.equal(slice.lines.length, 1)
  assert.equal(slice.lines[0]!.lineItemId, "billing-search::PC2SEA001")
})

test("slice: client-pays keeps fee, zeros billing media on that line", () => {
  const financials = computeCampaignFinancials(fixture({ clientPays: true }), {
    feeLoading: {},
  })
  const slice = computeApprovedSlice({ financials })
  const pd = slice.lines.find((l) => l.lineItemId.includes("PD001"))
  assert.ok(pd)
  assert.equal(pd!.mediaCents, 0)
  assert.ok(pd!.feeCents > 0)
})

test("slice: production row is first-class productionCents", () => {
  const financials = computeCampaignFinancials(fixture(), { feeLoading: {} })
  const slice = computeApprovedSlice({
    financials,
    approvedLineItemIds: ["billing-production::PC2PRD001"],
  })
  assert.equal(slice.lines.length, 1)
  assert.ok(slice.lines[0]!.productionCents > 0)
  assert.equal(slice.totalCents, slice.lines[0]!.productionCents)
})

test("C1 gate: matching schedule + slice is ok", () => {
  const financials = computeCampaignFinancials(fixture(), { feeLoading: {} })
  const slice = computeApprovedSlice({ financials })
  const exploded = explodeScheduleToMonthRows(1, "billing", financials.billingSchedule)
  assert.equal(exploded.failureReason, null)
  const result = evaluateFullScopeGate({
    scheduleRows: exploded.rows,
    approvedSlice: slice,
    mode: "enforce",
  })
  assert.equal(result.ok, true, result.message)
  assert.ok(Math.abs(result.deltaCents) <= 1)
})

test("C1 gate: drifted fixture — log does not block semantics (ok=false, mode=log)", () => {
  const financials = computeCampaignFinancials(fixture(), { feeLoading: {} })
  const slice = computeApprovedSlice({
    financials,
    approvedLineItemIds: ["billing-search::PC2SEA001"],
  })
  const exploded = explodeScheduleToMonthRows(1, "billing", financials.billingSchedule)
  const result = evaluateFullScopeGate({
    scheduleRows: exploded.rows,
    approvedSlice: slice,
    mode: "log",
  })
  assert.equal(result.ok, false)
  assert.equal(result.mode, "log")
  assert.ok(result.message.includes("Full-scope C1 drift"))
  assert.ok(
    result.drifts.some((d) => d.component !== "total" || d.lineItemId != null) ||
      result.drifts.some((d) => d.component === "total")
  )
})

test("C1 gate: enforce names component in message", () => {
  const financials = computeCampaignFinancials(fixture(), { feeLoading: {} })
  const slice = computeApprovedSlice({
    financials,
    approvedLineItemIds: ["billing-search::PC2SEA001"],
  })
  const exploded = explodeScheduleToMonthRows(1, "billing", financials.billingSchedule)
  const result = evaluateFullScopeGate({
    scheduleRows: exploded.rows,
    approvedSlice: slice,
    mode: "enforce",
  })
  assert.equal(result.ok, false)
  assert.match(result.message, /media|fee|adserving|production|total/i)
})

test("sumBillingScheduleFullScopeCents aggregates billing basis only", () => {
  const financials = computeCampaignFinancials(fixture(), { feeLoading: {} })
  const billing = explodeScheduleToMonthRows(1, "billing", financials.billingSchedule)
  const delivery = explodeScheduleToMonthRows(1, "delivery", financials.deliverySchedule)
  const sum = sumBillingScheduleFullScopeCents([...billing.rows, ...delivery.rows])
  const billingOnly = sumBillingScheduleFullScopeCents(billing.rows)
  assert.equal(sum.totalCents, billingOnly.totalCents)
})
