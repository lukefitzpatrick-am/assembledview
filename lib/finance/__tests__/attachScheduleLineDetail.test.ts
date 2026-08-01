import assert from "node:assert/strict"
import test from "node:test"

import { explodeScheduleToMonthRows } from "../../../scripts/migration/_scheduleTransform.js"
import { billingMonthsHaveDetailedLineItems } from "@/lib/mediaplan/partialMba"
import {
  assertScheduleLineItemsMatchMonthTotals,
  collectScheduleLineDetailViolations,
} from "../attachScheduleLineDetail.js"
import { computeCampaignFinancials } from "../computeCampaignFinancials.js"
import { recomputeAndValidateBillingScheduleOnSave } from "../recomputeBillingScheduleOnSave.js"
import type { LineItemInput } from "../campaignFinancials.types.js"

/** Mixed fixture shaped like a real MBA (stable billing-*::LINE ids). */
function boss001StyleFixture(): LineItemInput[] {
  return [
    {
      lineItemId: "billing-search::BOSS001SEA001",
      mediaType: "search",
      buyType: "cpc",
      rate: 2,
      enteredAmount: 10_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 20,
      label: "Google | Brand",
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
      // Client pays media — billing media 0, fee still agency-billed.
      lineItemId: "billing-progDisplay::BOSS001PD001",
      mediaType: "progDisplay",
      buyType: "cpm",
      rate: 10,
      enteredAmount: 5_000,
      budgetIncludesFees: false,
      clientPaysForMedia: true,
      feePct: 15,
      label: "DV360 | ROAS",
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
      lineItemId: "billing-production::BOSS001PRD001",
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
      // Manual media dump into May (prepayment-style override).
      lineItemId: "billing-socialMedia::BOSS001SOC001",
      mediaType: "socialMedia",
      buyType: "cpm",
      rate: 8,
      enteredAmount: 4_000,
      budgetIncludesFees: false,
      clientPaysForMedia: false,
      feePct: 10,
      label: "Meta | Prospecting",
      bursts: [
        {
          startDate: "2026-05-01",
          endDate: "2026-06-30",
          budget: 4_000,
          buyAmount: 8,
        },
      ],
      approval: "approved",
      billingOverride: {
        mode: "manual",
        reason: "prepayment",
        dateBasis: "test",
        months: [{ month: "2026-05", amount: 4_000 }],
      },
    },
  ]
}

test("mixed fixture: server schedule has detailed lineItems + header invariant", () => {
  const financials = computeCampaignFinancials(boss001StyleFixture(), {
    feeLoading: {},
  })

  assert.equal(
    billingMonthsHaveDetailedLineItems(financials.billingSchedule),
    true
  )
  assert.equal(
    billingMonthsHaveDetailedLineItems(financials.deliverySchedule),
    true
  )

  assertScheduleLineItemsMatchMonthTotals(
    financials.billingSchedule,
    "billing"
  )
  assertScheduleLineItemsMatchMonthTotals(
    financials.deliverySchedule,
    "delivery"
  )
  assert.equal(
    collectScheduleLineDetailViolations(financials.billingSchedule).length,
    0
  )

  // Client-pays line: fee present, billing media 0.
  const may = financials.billingSchedule.find((m) => m.monthYear === "May 2026")
  assert.ok(may?.lineItems?.progDisplay?.length)
  const pd = may!.lineItems!.progDisplay!.find(
    (li) => li.id === "billing-progDisplay::BOSS001PD001"
  )
  assert.ok(pd)
  assert.equal(pd!.clientPaysForMedia, true)
  assert.equal(pd!.monthlyAmounts["May 2026"] ?? 0, 0)
  assert.ok((pd!.feeMonthlyAmounts?.["May 2026"] ?? 0) > 0)
  assert.ok(pd!.adServingMonthlyAmounts)

  // Manual / prepayment line.
  const soc = may!.lineItems!.socialMedia!.find(
    (li) => li.id === "billing-socialMedia::BOSS001SOC001"
  )
  assert.ok(soc)
  assert.equal(soc!.billingMode, "manual")
  assert.equal(soc!.preBill, true)
  assert.equal(soc!.monthlyAmounts["May 2026"], 4_000)
  assert.equal(soc!.monthlyAmounts["June 2026"] ?? 0, 0)

  // Production sits under production key; does not inflate mediaTotal.
  assert.ok(may!.lineItems?.production?.length)
})

test("recomputeBillingScheduleOnSave omit path carries lineItems", () => {
  const result = recomputeAndValidateBillingScheduleOnSave({
    lineItems: boss001StyleFixture(),
    feeLoading: {},
    clientBillingSchedule: null,
    overrideRows: [],
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.generatedFromServer, true)
  assert.equal(
    billingMonthsHaveDetailedLineItems(result.billingSchedule),
    true
  )
  assert.equal(
    billingMonthsHaveDetailedLineItems(result.deliverySchedule),
    true
  )
  assertScheduleLineItemsMatchMonthTotals(result.billingSchedule, "recompute")
})

test("golden: explodeScheduleToMonthRows uses real line ids (no __service__ when lines exist)", () => {
  const financials = computeCampaignFinancials(boss001StyleFixture(), {
    feeLoading: {},
  })

  const billing = explodeScheduleToMonthRows(
    1,
    "billing",
    financials.billingSchedule
  )
  const delivery = explodeScheduleToMonthRows(
    1,
    "delivery",
    financials.deliverySchedule
  )
  assert.equal(billing.failureReason, null)
  assert.equal(delivery.failureReason, null)
  assert.ok(billing.rows.length > 0)

  const realIds = new Set(
    [...billing.rows, ...delivery.rows]
      .map((r) => r.lineItemId)
      .filter((id) => !id.startsWith("__service__"))
  )
  assert.ok(realIds.has("billing-search::BOSS001SEA001"))
  assert.ok(realIds.has("billing-progDisplay::BOSS001PD001"))
  assert.ok(realIds.has("billing-socialMedia::BOSS001SOC001"))
  assert.ok(realIds.has("billing-production::BOSS001PRD001"))

  // When real line detail exists, media/fee should not fall back to synthetic totals.
  const synthetic = [...billing.rows, ...delivery.rows].filter((r) =>
    r.lineItemId.startsWith("__service__")
  )
  // Adserving/production service buckets may still appear as month-header mirrors;
  // forbid the no-line-items fallbacks that swallow real media/fee.
  assert.ok(
    !synthetic.some((r) => r.lineItemId === "__service__media_total"),
    "must not emit __service__media_total when per-line media exists"
  )
  assert.ok(
    !synthetic.some((r) => r.lineItemId === "__service__fees"),
    "must not emit __service__fees when per-line fees exist"
  )
})
