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

function productionConfig(line: Record<string, unknown>): SeedLineFeesMediaConfig {
  return {
    billingKey: "production",
    lineItems: [line],
    containerBursts: [],
  }
}

test("production line with null buy_type resolves LineItemInput.buyType to production", () => {
  const [input] = buildEditorLineItemInputs([
    productionConfig({
      line_item_id: "glenda008PROD1",
      buy_type: null,
      bursts: [
        {
          cost: 4000,
          amount: 3,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
        },
      ],
    }),
  ])
  assert.equal(input!.buyType, "production")
})

test("production line with blank buyType resolves to production", () => {
  const [input] = buildEditorLineItemInputs([
    productionConfig({
      line_item_id: "PROD2",
      buyType: "",
      bursts: [{ cost: 100, amount: 1, startDate: "2026-01-01", endDate: "2026-01-31" }],
    }),
  ])
  assert.equal(input!.buyType, "production")
})

test("radio blank buyType stays blank (production default is channel-scoped)", () => {
  const [input] = buildEditorLineItemInputs([radioConfig(radioLine(["0"]))])
  assert.equal(input!.buyType, "spots")
  const [blank] = buildEditorLineItemInputs([
    radioConfig({ line_item_id: "R2", buyType: "", totalMedia: 1, bursts: [{ ...BURST_DATES, budget: "0" }] }),
  ])
  assert.equal(blank!.buyType, "")
})

test("glenda008-shaped production line with null buy_type emits zero deliverableBudget warnings", () => {
  const prev = process.env.NODE_ENV
  const env = process.env as { NODE_ENV?: string }
  env.NODE_ENV = "development"
  const originalWarn = console.warn
  const warns: string[] = []
  console.warn = (...args: unknown[]) => {
    warns.push(args.map(String).join(" "))
  }
  try {
    const [input] = buildEditorLineItemInputs([
      productionConfig({
        line_item_id: "glenda008PROD1",
        buy_type: null,
        bursts: [
          {
            cost: 4000,
            amount: 3,
            startDate: "2026-01-01",
            endDate: "2026-01-31",
          },
        ],
      }),
    ])
    assert.equal(input!.buyType, "production")
    computeCampaignFinancials([input!], { feeLoading: {} })
    const budgetWarns = warns.filter((w) => w.includes("[deliverableBudget]"))
    assert.deepEqual(budgetWarns, [])
  } finally {
    console.warn = originalWarn
    env.NODE_ENV = prev
  }
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
