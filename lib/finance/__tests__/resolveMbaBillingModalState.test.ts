import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"
import { rebuildTimingDraftAfterBillingSave } from "../manualBillingOverridesUi.js"
import {
  assertMbaBillingModalMonthsAgree,
  collectMbaBillingModalMonthAgreement,
  resolveMbaBillingModalState,
} from "../resolveMbaBillingModalState.js"

function searchLine(overrides?: Partial<LineItemInput>): LineItemInput {
  return {
    lineItemId: "supabase001PB1",
    mediaType: "search",
    buyType: "cpc",
    rate: 1,
    enteredAmount: 20_000,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 25,
    bursts: [
      {
        startDate: "2026-08-01",
        endDate: "2026-09-30",
        budget: 20_000,
      },
    ],
    approval: "approved",
    ...overrides,
  }
}

function prebillDraftMonths(): BillingMonth[] {
  return [
    {
      monthYear: "August 2026",
      mediaTotal: "$20,000.00",
      feeTotal: "$5,000.00",
      totalAmount: "$25,000.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: { search: "$20,000.00" } as BillingMonth["mediaCosts"],
      lineItems: {
        search: [
          {
            id: "billing-search::supabase001PB1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "August 2026": 20_000, "September 2026": 0 },
            feeMonthlyAmounts: { "August 2026": 5000, "September 2026": 0 },
            totalAmount: 20_000,
            billingMode: "manual",
            preBill: true,
          },
        ],
      },
    },
    {
      monthYear: "September 2026",
      mediaTotal: "$0.00",
      feeTotal: "$0.00",
      totalAmount: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: { search: "$0.00" } as BillingMonth["mediaCosts"],
      lineItems: {
        search: [
          {
            id: "billing-search::supabase001PB1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "August 2026": 20_000, "September 2026": 0 },
            feeMonthlyAmounts: { "August 2026": 5000, "September 2026": 0 },
            totalAmount: 20_000,
            billingMode: "manual",
            preBill: true,
          },
        ],
      },
    },
  ]
}

const persistedRows = [
  {
    line_item_id: "supabase001PB1",
    component: "media" as const,
    mode: "manual" as const,
    reason: "prepayment" as const,
    date_basis: "basis",
    months: [
      { month: "2026-08", amount: 20_000 },
      { month: "2026-09", amount: 0 },
    ],
  },
]

/** MB-7 invariant — must hold after save, after reload, and mid-hydration. */
function assertInvariant(state: ReturnType<typeof resolveMbaBillingModalState>, label: string) {
  assert.doesNotThrow(() => assertMbaBillingModalMonthsAgree(state, label))
  for (const pair of collectMbaBillingModalMonthAgreement(state)) {
    assert.ok(
      Math.abs(pair.delta) <= 0.01,
      `${label}: ${pair.monthYear} left ${pair.leftMedia} ≠ right ${pair.rightMedia}`
    )
  }
}

test("MB-7: stranded draftReady+empty months → both halves empty (invariant)", () => {
  // Same failure shape as live MB-6: draftReady true, months wiped, overrides still present.
  const state = resolveMbaBillingModalState({
    lineItems: [searchLine()],
    feeLoading: { feesearch: 25 },
    overrideRows: persistedRows,
    draftReady: true,
    draftMonths: [],
    campaignStart: new Date("2026-08-01"),
    campaignEnd: new Date("2026-09-30"),
  })
  assert.equal(state.viewReady, false)
  assert.equal(state.financials.billingSchedule.length, 0)
  assert.equal(state.resolvedMonths.length, 0)
  assertInvariant(state, "stranded")
})

test("MB-7: after save rebuild — left months === right schedule Media (shared ref)", () => {
  const autoReference = prebillDraftMonths().map((m) => ({
    ...m,
    mediaTotal: m.monthYear === "August 2026" ? "$10,000.00" : "$10,000.00",
    mediaCosts: {
      search: m.monthYear === "August 2026" ? "$10,000.00" : "$10,000.00",
    } as BillingMonth["mediaCosts"],
    lineItems: {
      search: [
        {
          ...m.lineItems!.search![0]!,
          monthlyAmounts: { "August 2026": 10_000, "September 2026": 10_000 },
          billingMode: "auto" as const,
          preBill: false,
        },
      ],
    },
  }))
  const saved = prebillDraftMonths()
  const { draftMonths } = rebuildTimingDraftAfterBillingSave({
    savedMonths: saved,
    autoReferenceMonths: autoReference,
    persistedRows,
  })

  const state = resolveMbaBillingModalState({
    lineItems: [searchLine()],
    feeLoading: { feesearch: 25 },
    overrideRows: persistedRows,
    draftReady: true,
    draftMonths,
    campaignStart: new Date("2026-08-01"),
    campaignEnd: new Date("2026-09-30"),
  })

  assert.equal(state.viewReady, true)
  assert.equal(state.financials.billingSchedule, state.resolvedMonths)
  assert.equal(state.resolvedMonths[0]!.mediaTotal, "$20,000.00")
  assert.equal(state.resolvedMonths[1]!.mediaTotal, "$0.00")
  assertInvariant(state, "after-save")
})

test("MB-7: after reload (draft closed) — invariant N/A / holds; overrides drive schedule", () => {
  const state = resolveMbaBillingModalState({
    lineItems: [searchLine()],
    feeLoading: { feesearch: 25 },
    overrideRows: persistedRows,
    draftReady: false,
    draftMonths: [],
    campaignStart: new Date("2026-08-01"),
    campaignEnd: new Date("2026-09-30"),
  })
  assert.equal(state.viewReady, true)
  assert.equal(state.draftSessionActive, false)
  assert.equal(state.resolvedMonths.length, 0)
  assert.ok(state.financials.billingSchedule.length > 0)
  assertInvariant(state, "after-reload")
})

test("MB-7: mid-hydration (no line items yet) — no left timing; halves agree", () => {
  // computeCampaignFinancials may still emit a zero header month from campaign dates —
  // left timing is closed (resolvedMonths=[]) so the invariant is N/A / holds.
  const state = resolveMbaBillingModalState({
    lineItems: [],
    feeLoading: {},
    overrideRows: [],
    draftReady: false,
    draftMonths: [],
  })
  assert.equal(state.viewReady, true)
  assert.equal(state.draftSessionActive, false)
  assert.equal(state.resolvedMonths.length, 0)
  assertInvariant(state, "mid-hydration")
})

test("MB-7: mid-edit draft session — left and right share the same BillingMonth[]", () => {
  const draft = prebillDraftMonths()
  // Simulate a cell edit retiming September to $5k / August $15k.
  draft[0]!.mediaTotal = "$15,000.00"
  draft[0]!.mediaCosts = { search: "$15,000.00" } as BillingMonth["mediaCosts"]
  draft[0]!.lineItems!.search![0]!.monthlyAmounts = {
    "August 2026": 15_000,
    "September 2026": 5_000,
  }
  draft[1]!.mediaTotal = "$5,000.00"
  draft[1]!.mediaCosts = { search: "$5,000.00" } as BillingMonth["mediaCosts"]
  draft[1]!.lineItems!.search![0]!.monthlyAmounts = {
    "August 2026": 15_000,
    "September 2026": 5_000,
  }

  const state = resolveMbaBillingModalState({
    lineItems: [searchLine()],
    feeLoading: { feesearch: 25 },
    overrideRows: persistedRows,
    draftReady: true,
    draftMonths: draft,
    campaignStart: new Date("2026-08-01"),
    campaignEnd: new Date("2026-09-30"),
  })

  assert.strictEqual(state.financials.billingSchedule, draft)
  assert.strictEqual(state.resolvedMonths, draft)
  assertInvariant(state, "mid-edit")
})
