/**
 * C-98: edit page adopts the lib helper with resolveLineItemId + emitFees: false.
 */
import assert from "node:assert/strict"
import test from "node:test"

import { generateBillingLineItems } from "../generateBillingLineItems.js"
import { editorBillingStableLineItemId } from "@/lib/finance/buildEditorLineItemInputs"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"

const MONTHS = [
  { monthYear: "July 2026" },
  { monthYear: "August 2026" },
  { monthYear: "September 2026" },
]

const PAID_SOCIAL = {
  line_item_id: "glenda008SM1",
  platform: "Meta",
  targeting: "Prospecting",
  clientPaysForMedia: false,
  budgetIncludesFees: false,
  feePercentage: 20,
  buyType: "cpm",
  bursts: [
    {
      startDate: "2026-07-01",
      endDate: "2026-09-18",
      budget: "20000",
    },
  ],
}

const CLIENT_PAYS_SOCIAL = {
  ...PAID_SOCIAL,
  clientPaysForMedia: true,
}

function defaultId(mediaType: string, header1: string, header2: string, index: number) {
  return `${mediaType}-${header1 || "Item"}-${header2 || "Details"}-${index}`
}

test("emitFees false: feeMonthlyAmounts, totalFeeAmount and feeAmount are absent", () => {
  const lines = generateBillingLineItems(
    [PAID_SOCIAL],
    "socialMedia",
    MONTHS,
    "billing",
    { emitFees: false }
  )
  assert.equal(lines.length, 1)
  const line = lines[0]!
  assert.equal(Object.hasOwn(line, "feeMonthlyAmounts"), false)
  assert.equal(Object.hasOwn(line, "totalFeeAmount"), false)
  assert.equal(Object.hasOwn(line, "feeAmount"), false)
  assert.equal("feeMonthlyAmounts" in line, false)
  assert.equal("totalFeeAmount" in line, false)
  assert.equal("feeAmount" in line, false)
})

test("emitFees default: fee keys are present and match today's amounts", () => {
  const lines = generateBillingLineItems([PAID_SOCIAL], "socialMedia", MONTHS, "billing")
  assert.equal(lines.length, 1)
  const line = lines[0]!
  assert.equal(Object.hasOwn(line, "feeMonthlyAmounts"), true)
  assert.equal(Object.hasOwn(line, "totalFeeAmount"), true)
  assert.equal(Object.hasOwn(line, "feeAmount"), true)
  const feeTotal = Object.values(line.feeMonthlyAmounts ?? {}).reduce((s, v) => s + v, 0)
  assert.equal(Math.round(feeTotal * 100) / 100, 5000)
  assert.equal(Math.round((line.totalFeeAmount ?? 0) * 100) / 100, 5000)
  assert.equal(Math.round((line.feeAmount ?? 0) * 100) / 100, 5000)
})

test("without resolveLineItemId, ids stay the create-page template", () => {
  const lines = generateBillingLineItems([PAID_SOCIAL], "socialMedia", MONTHS, "billing")
  assert.equal(lines.length, 1)
  assert.equal(lines[0]!.id, defaultId("socialMedia", "Meta", "Prospecting", 0))
})

test("resolveLineItemId mints ids; duplicate line_item_id collapses, last wins", () => {
  const first = { ...PAID_SOCIAL, line_item_id: "shared", targeting: "A" }
  const second = {
    ...PAID_SOCIAL,
    line_item_id: "shared",
    targeting: "B",
    bursts: [
      {
        startDate: "2026-07-01",
        endDate: "2026-09-18",
        budget: "10000",
      },
    ],
  }
  const lines = generateBillingLineItems(
    [first, second],
    "socialMedia",
    MONTHS,
    "billing",
    { resolveLineItemId: editorBillingStableLineItemId }
  )
  assert.equal(lines.length, 1)
  assert.equal(lines[0]!.id, "billing-socialMedia::shared")
  assert.equal(lines[0]!.header2, "B")
  assert.equal(Math.round(lines[0]!.totalAmount * 100) / 100, 10_000)
})

test("resolver id round-trips to raw line_item_id and is billing-stable", () => {
  const lines = generateBillingLineItems(
    [PAID_SOCIAL],
    "socialMedia",
    MONTHS,
    "billing",
    { resolveLineItemId: editorBillingStableLineItemId }
  )
  const id = lines[0]!.id
  assert.equal(id.startsWith("billing-"), true)
  assert.equal(toBillingOverrideLineItemId(id), "glenda008SM1")
})

test("client-pays billing: media 0, row present; emitFees default keeps fee months", () => {
  const lines = generateBillingLineItems(
    [CLIENT_PAYS_SOCIAL],
    "socialMedia",
    MONTHS,
    "billing"
  )
  assert.equal(lines.length, 1)
  const line = lines[0]!
  assert.equal(line.totalAmount, 0)
  for (const month of MONTHS) {
    assert.equal(line.monthlyAmounts[month.monthYear] ?? 0, 0)
  }
  const feeTotal = Object.values(line.feeMonthlyAmounts ?? {}).reduce((s, v) => s + v, 0)
  assert.equal(Math.round(feeTotal * 100) / 100, 5000)
})

test("bonus buyType zeros billed media even with a non-zero budget", () => {
  const lines = generateBillingLineItems(
    [{ ...PAID_SOCIAL, buyType: "bonus" }],
    "socialMedia",
    MONTHS,
    "billing"
  )
  assert.equal(lines.length, 1)
  assert.equal(lines[0]!.totalAmount, 0)
  assert.equal(Math.round((lines[0]!.totalFeeAmount ?? 0) * 100) / 100, 0)
})

test("package_inclusions buyType zeros billed media even with a non-zero budget", () => {
  const lines = generateBillingLineItems(
    [{ ...PAID_SOCIAL, buyType: "package_inclusions" }],
    "socialMedia",
    MONTHS,
    "billing"
  )
  assert.equal(lines.length, 1)
  assert.equal(lines[0]!.totalAmount, 0)
})

test("bonus buyType still zeros media when emitFees is false", () => {
  const lines = generateBillingLineItems(
    [{ ...PAID_SOCIAL, buyType: "bonus" }],
    "socialMedia",
    MONTHS,
    "billing",
    { emitFees: false }
  )
  assert.equal(lines.length, 1)
  assert.equal(lines[0]!.totalAmount, 0)
  assert.equal(Object.hasOwn(lines[0]!, "feeMonthlyAmounts"), false)
})

const PRODUCTION_COST_AMOUNT_LINE = {
  line_item_id: "prod1",
  bursts: [
    {
      cost: 1500,
      amount: 2,
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    },
  ],
}

/** Same parse as today's edit-page local helper (budget / buyAmount strings only). */
function editPageBurstBudget(burst: unknown): number {
  const raw = burst as { budget?: { replace?: (re: RegExp, s: string) => string }; buyAmount?: { replace?: (re: RegExp, s: string) => string } }
  return (
    parseFloat(raw?.budget?.replace?.(/[^0-9.-]/g, "") || "0") ||
    parseFloat(raw?.buyAmount?.replace?.(/[^0-9.-]/g, "") || "0") ||
    0
  )
}

test("default: production burst without budget uses cost × amount (create/export unchanged)", () => {
  const lines = generateBillingLineItems(
    [PRODUCTION_COST_AMOUNT_LINE],
    "production",
    [{ monthYear: "July 2026" }],
    "billing"
  )
  assert.equal(lines.length, 1)
  assert.equal(Math.round(lines[0]!.totalAmount * 100) / 100, 3000)
})

test("resolveBurstBudget: production cost×amount without budget bills 0 (edit-page parser)", () => {
  const lines = generateBillingLineItems(
    [PRODUCTION_COST_AMOUNT_LINE],
    "production",
    [{ monthYear: "July 2026" }],
    "billing",
    { emitFees: false, resolveBurstBudget: editPageBurstBudget }
  )
  assert.equal(lines.length, 1)
  assert.equal(lines[0]!.totalAmount, 0)
  assert.equal(Object.hasOwn(lines[0]!, "feeMonthlyAmounts"), false)
  assert.equal(Object.hasOwn(lines[0]!, "totalFeeAmount"), false)
  assert.equal(Object.hasOwn(lines[0]!, "feeAmount"), false)
})
