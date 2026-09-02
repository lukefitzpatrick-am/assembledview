/**
 * Stated-zero burst budgets must not be refilled from the line total.
 * Blank (never entered) still back-fills — that is the legacy-data path.
 */
import assert from "node:assert/strict"
import test from "node:test"

import type { SeedLineFeesMediaConfig } from "@/lib/billing/seedLineFees"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import { buildEditorLineItemInputs } from "@/lib/finance/buildEditorLineItemInputs"
import { parseMoneyInput } from "@/lib/format/money"
import type { LineItemInput } from "@/lib/finance/campaignFinancials.types"

const LINE_TOTAL = 50_000
const BURST_DATES = { startDate: "2026-01-01", endDate: "2026-01-31" }

function radioConfig(line: Record<string, unknown>): SeedLineFeesMediaConfig {
  return {
    billingKey: "radio",
    lineItems: [line],
    containerBursts: [],
  }
}

function radioLine(burstBudgets: unknown[]): Record<string, unknown> {
  return {
    line_item_id: "R1",
    buyType: "spots",
    totalMedia: LINE_TOTAL,
    bursts: burstBudgets.map((budget) => ({ ...BURST_DATES, budget })),
  }
}

test("stated zero bursts do not back-fill enteredAmount from the line total", () => {
  const [input] = buildEditorLineItemInputs([radioConfig(radioLine(["0", "0", "0"]))])
  assert.equal(input!.enteredAmount, 0)
})

test("blank (never-entered) bursts still back-fill enteredAmount from the line total", () => {
  const [input] = buildEditorLineItemInputs([radioConfig(radioLine(["", "", ""]))])
  assert.equal(input!.enteredAmount, LINE_TOTAL)
})

test("one stated zero among blanks is enough to skip the line-total back-fill", () => {
  const [input] = buildEditorLineItemInputs([radioConfig(radioLine(["0", "", ""]))])
  assert.equal(input!.enteredAmount, 0)
})

test("enteredAmount 0 with three zero-budget bursts produces zero media, fee, and months", () => {
  const line: LineItemInput = {
    lineItemId: "R1",
    mediaType: "radio",
    buyType: "spots",
    rate: 0,
    enteredAmount: 0,
    budgetIncludesFees: false,
    clientPaysForMedia: false,
    feePct: 10,
    bursts: [
      { ...BURST_DATES, budget: 0 },
      { ...BURST_DATES, budget: 0 },
      { ...BURST_DATES, budget: 0 },
    ],
    approval: "approved",
  }

  const result = computeCampaignFinancials([line], {
    feeLoading: { feeradio: 10 },
  })
  const pl = result.perLine[0]!
  assert.equal(pl.media, 0)
  assert.equal(pl.fee, 0)
  assert.ok(pl.billingMonths.every((m) => m.amount === 0))
  assert.ok(pl.deliveryMonths.every((m) => m.amount === 0))
  assert.equal(result.mbaScopeTotals.grossMedia, 0)
  assert.equal(result.mbaScopeTotals.fee, 0)
  for (const month of result.billingSchedule) {
    assert.equal(parseMoneyInput(month.mediaTotal) ?? 0, 0)
    assert.equal(parseMoneyInput(month.feeTotal) ?? 0, 0)
    assert.equal(parseMoneyInput(month.totalAmount) ?? 0, 0)
  }
})
