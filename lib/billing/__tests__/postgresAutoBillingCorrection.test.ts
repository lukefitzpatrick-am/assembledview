/**
 * O4 — auto-only drift must not block postgres save; manual lines stay protected.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { BillingMonth } from "../types"
import {
  evaluatePostgresAutoDivergence,
  hasExplicitManualBillingLines,
  isAutoOnlyBillingDivergence,
  summarizeAutoBillingCorrection,
} from "../postgresAutoBillingCorrection"
import { compareBillingDivergence } from "../compareBillingDivergence"
import { recomputeAndValidateBillingScheduleOnSave } from "@/lib/finance/recomputeBillingScheduleOnSave"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"

function month(
  monthYear: string,
  lines: Array<{
    id: string
    media: number
    fee?: number
    billingMode?: "auto" | "manual"
  }>
): BillingMonth {
  return {
    monthYear,
    mediaTotal: `$${lines.reduce((s, l) => s + l.media, 0).toFixed(2)}`,
    feeTotal: `$${lines.reduce((s, l) => s + (l.fee ?? 0), 0).toFixed(2)}`,
    totalAmount: `$${lines
      .reduce((s, l) => s + l.media + (l.fee ?? 0), 0)
      .toFixed(2)}`,
    adservingTechFees: "$0.00",
    production: "$0.00",
    mediaCosts: { search: `$${lines.reduce((s, l) => s + l.media, 0).toFixed(2)}` },
    lineItems: {
      search: lines.map((l) => ({
        id: l.id,
        header1: l.id,
        header2: "",
        billingMode: l.billingMode,
        monthlyAmounts: { [monthYear]: l.media },
        ...(l.fee != null
          ? { feeMonthlyAmounts: { [monthYear]: l.fee } }
          : {}),
        totalAmount: l.media,
      })),
    },
  }
}

function searchLine(overrides?: Partial<LineItemInput>): LineItemInput {
  return {
    lineItemId: "krusty015SM1",
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

describe("postgresAutoBillingCorrection (O4)", () => {
  it("krusty-class: stale AUTO fee headers vs recompute is auto-only (must not block)", () => {
    // Persisted/working: understated fee (fresh-load / burst-pipeline mismatch).
    const working = [
      month("Jun 2026", [{ id: "krusty015SM1", media: 5000, fee: 600, billingMode: "auto" }]),
      month("Jul 2026", [{ id: "krusty015SM1", media: 5000, fee: 600, billingMode: "auto" }]),
    ]
    // Auto/server preview: correct 20% fee.
    const auto = [
      month("Jun 2026", [{ id: "krusty015SM1", media: 5000, fee: 1000, billingMode: "auto" }]),
      month("Jul 2026", [{ id: "krusty015SM1", media: 5000, fee: 1000, billingMode: "auto" }]),
    ]
    const { divergence, autoOnly, correction } = evaluatePostgresAutoDivergence({
      working,
      autoReference: auto,
    })
    assert.equal(divergence.isDivergent, true)
    assert.equal(autoOnly, true)
    assert.equal(hasExplicitManualBillingLines(working), false)
    assert.ok(correction)
    assert.ok(correction!.correctedLineCount >= 1)
    assert.match(correction!.toastDescription, /Server corrected/)
    assert.match(correction!.toastDescription, /Δ/)
  })

  it("undefined billingMode (legacy auto) + month-header drift is still auto-only", () => {
    const working = [month("Jun 2026", [{ id: "L1", media: 1000 }])]
    const auto = [month("Jun 2026", [{ id: "L1", media: 1200 }])]
    const divergence = compareBillingDivergence(working, auto)
    assert.equal(isAutoOnlyBillingDivergence(working, divergence), true)
  })

  it("explicit manual line → not auto-only (keep C2 / human gate)", () => {
    const working = [
      month("Jun 2026", [{ id: "L1", media: 500, billingMode: "manual" }]),
    ]
    const auto = [
      month("Jun 2026", [{ id: "L1", media: 1000, billingMode: "auto" }]),
    ]
    const divergence = compareBillingDivergence(working, auto)
    assert.equal(divergence.isDivergent, true)
    assert.equal(isAutoOnlyBillingDivergence(working, divergence), false)
    assert.equal(hasExplicitManualBillingLines(working), true)
  })

  it("summarizeAutoBillingCorrection formats toast copy", () => {
    const divergence = compareBillingDivergence(
      [month("Jun 2026", [{ id: "A", media: 100 }])],
      [month("Jun 2026", [{ id: "A", media: 200 }])]
    )
    const summary = summarizeAutoBillingCorrection(divergence)
    assert.ok(summary)
    assert.match(summary!.toastDescription, /Server corrected \d+ line/)
    assert.match(summary!.toastDescription, /Δ/)
  })
})

describe("Xano gate remains reject-on-auto-drift (byte-identical contract)", () => {
  it("recomputeAndValidate still 409s on stale AUTO fee schedule", () => {
    const fresh = recomputeAndValidateBillingScheduleOnSave({
      lineItems: [searchLine()],
      feeLoading: {},
      clientBillingSchedule: null,
      overrideRows: [],
    })
    assert.equal(fresh.ok, true)
    if (!fresh.ok) return

    const stale = fresh.billingSchedule.map((m) => ({
      ...m,
      mediaCosts: { ...m.mediaCosts },
      feeTotal: "$600.00",
    }))
    const result = recomputeAndValidateBillingScheduleOnSave({
      lineItems: [searchLine()],
      feeLoading: {},
      clientBillingSchedule: stale,
      overrideRows: [],
    })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.body.code, "BILLING_SCHEDULE_DIVERGENCE")
    assert.match(String(result.body.userMessage), /reset to auto/i)
  })
})
