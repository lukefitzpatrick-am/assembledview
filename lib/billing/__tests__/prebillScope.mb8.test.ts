import assert from "node:assert/strict"
import test from "node:test"

import type { BillingMonth } from "@/lib/billing/types"
import { validateAgencyFeeMonthTotalDrift } from "@/lib/billing/validateAgencyFeeMonthTotalDrift.js"
import {
  clearPrebillScopeSessionMemory,
  createPrebillScopeSessionMemory,
  prebillBadgeLabelFromFlags,
  prebillFlagsFromOverrideReasons,
  rememberPrebillScope,
  rememberedPrebillScope,
} from "../prebillScope.js"
import { applyBillingLineMode } from "@/lib/billing/applyBillingLineMode.js"
import {
  applyLineFeePrebillToMonths,
  applyLinePrebillToMonths,
  clearLineOverrideMeta,
  extractOverrideMonthsFromSchedule,
  listManualOverrideLineIds,
  sumLineFeeAcrossMonths,
  upsertLineOverrideMeta,
  type LineOverrideMeta,
} from "@/lib/finance/manualBillingOverridesUi.js"
import { syncBillingMonthHeadersFromLineItems } from "@/lib/finance/resolveMbaBillingModalState.js"

function twoMonthLine(feeAug: number, feeSep: number): BillingMonth[] {
  return [
    {
      monthYear: "August 2026",
      mediaTotal: "$10,000.00",
      feeTotal: `$${feeAug.toFixed(2)}`,
      totalAmount: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: { search: "$10,000.00" } as BillingMonth["mediaCosts"],
      lineItems: {
        search: [
          {
            id: "billing-search::L1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "August 2026": 10_000, "September 2026": 10_000 },
            feeMonthlyAmounts: { "August 2026": feeAug, "September 2026": feeSep },
            totalAmount: 20_000,
            totalFeeAmount: feeAug + feeSep,
            billingMode: "auto",
          },
        ],
      },
    },
    {
      monthYear: "September 2026",
      mediaTotal: "$10,000.00",
      feeTotal: `$${feeSep.toFixed(2)}`,
      totalAmount: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: { search: "$10,000.00" } as BillingMonth["mediaCosts"],
      lineItems: {
        search: [
          {
            id: "billing-search::L1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "August 2026": 10_000, "September 2026": 10_000 },
            feeMonthlyAmounts: { "August 2026": feeAug, "September 2026": feeSep },
            totalAmount: 20_000,
            totalFeeAmount: feeAug + feeSep,
            billingMode: "auto",
          },
        ],
      },
    },
  ]
}

test("MB-8 badge vocabulary: media-only vs media+fee", () => {
  assert.equal(
    prebillBadgeLabelFromFlags(prebillFlagsFromOverrideReasons("prepayment", undefined)),
    "Media prepaid"
  )
  assert.equal(
    prebillBadgeLabelFromFlags(prebillFlagsFromOverrideReasons("prepayment", "manual")),
    "Media prepaid"
  )
  assert.equal(
    prebillBadgeLabelFromFlags(prebillFlagsFromOverrideReasons("prepayment", "prepayment")),
    "Prepaid"
  )
  assert.equal(prebillBadgeLabelFromFlags(prebillFlagsFromOverrideReasons("manual", undefined)), null)
})

test("MB-8 session memory: remember per line, clear on draft end", () => {
  const mem = createPrebillScopeSessionMemory()
  assert.equal(rememberedPrebillScope(mem, "billing-search::L1"), null)
  rememberPrebillScope(mem, "billing-search::L1", "media_and_fee")
  assert.equal(rememberedPrebillScope(mem, "L1"), "media_and_fee")
  assert.equal(mem.lastChoice, "media_and_fee")
  assert.equal(rememberedPrebillScope(mem, "L2"), null)
  clearPrebillScopeSessionMemory(mem)
  assert.equal(rememberedPrebillScope(mem, "L1"), null)
  assert.equal(mem.lastChoice, "media_only")
})

test("MB-8 media-only prebill: fee month totals still sum to derived — no fee-drift", () => {
  const feeAug = 2540.98
  const feeSep = 2459.02
  const derived = feeAug + feeSep
  const months = twoMonthLine(feeAug, feeSep)

  applyLinePrebillToMonths(months, "search", "L1", 20_000)
  syncBillingMonthHeadersFromLineItems(months)

  // Media dumped; fee maps untouched → header fee totals still delivery-timed.
  assert.equal(months[0]!.lineItems!.search![0]!.monthlyAmounts["August 2026"], 20_000)
  assert.equal(months[1]!.lineItems!.search![0]!.monthlyAmounts["September 2026"], 0)
  assert.equal(months[0]!.lineItems!.search![0]!.feeMonthlyAmounts!["August 2026"], feeAug)
  assert.equal(months[1]!.lineItems!.search![0]!.feeMonthlyAmounts!["September 2026"], feeSep)

  const feeDrift = validateAgencyFeeMonthTotalDrift(months, derived)
  assert.equal(feeDrift.withinTolerance, true, `diff=${feeDrift.diff}`)
  assert.ok(Math.abs(feeDrift.diff) < 0.01)
})

test("MB-8 media+fee prebill: both components in earliest month; listManual sees both", () => {
  const feeAug = 2540.98
  const feeSep = 2459.02
  const feeTotal = feeAug + feeSep
  let months = twoMonthLine(feeAug, feeSep)

  applyLinePrebillToMonths(months, "search", "L1", 20_000)
  applyLineFeePrebillToMonths(months, "search", "L1", feeTotal)
  syncBillingMonthHeadersFromLineItems(months)
  months = applyBillingLineMode(months, "L1", "manual")

  assert.equal(months[0]!.lineItems!.search![0]!.feeMonthlyAmounts!["August 2026"], feeTotal)
  assert.equal(months[1]!.lineItems!.search![0]!.feeMonthlyAmounts!["September 2026"], 0)
  assert.equal(months[0]!.lineItems!.search![0]!.feeBillingMode, "manual")

  const manual = listManualOverrideLineIds(months)
  assert.ok(manual.media.length > 0)
  assert.ok(manual.fee.length > 0)

  const mediaIso = extractOverrideMonthsFromSchedule(months, "L1", "media")
  assert.deepEqual(mediaIso, [
    { month: "2026-08", amount: 20_000 },
    { month: "2026-09", amount: 0 },
  ])
  const feeIso = extractOverrideMonthsFromSchedule(months, "L1", "fee")
  assert.deepEqual(feeIso, [
    { month: "2026-08", amount: feeTotal },
    { month: "2026-09", amount: 0 },
  ])

  assert.equal(sumLineFeeAcrossMonths(months, "L1"), feeTotal)
})

test("MB-8 clearLineOverrideMeta without component drops media + fee meta (reset_line lane)", () => {
  const meta = new Map<string, LineOverrideMeta[]>()
  upsertLineOverrideMeta(meta, "billing-search::L1", {
    mode: "manual",
    reason: "prepayment",
    dateBasis: "",
    component: "media",
  })
  upsertLineOverrideMeta(meta, "billing-search::L1", {
    mode: "manual",
    reason: "prepayment",
    dateBasis: "",
    component: "fee",
  })
  assert.equal(meta.get("billing-search::L1")?.length, 2)
  clearLineOverrideMeta(meta, "L1")
  assert.equal(meta.size, 0)
})
