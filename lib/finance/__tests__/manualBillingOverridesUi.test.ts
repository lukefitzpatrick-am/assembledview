import assert from "node:assert/strict"
import test from "node:test"

import { computeBillingOverrideDateBasis } from "../billingOverrideDateBasis.js"
import {
  applyBillingOverrideRowsToMonths,
  applyLinePrebillToMonths,
  billingOverrideLineIdsMatch,
  buildPrepaymentOverrideMonths,
  extractOverrideMonthsFromSchedule,
  rebuildTimingDraftAfterBillingSave,
  toBillingOverrideLineItemId,
  upsertLineOverrideMeta,
  upsertOptimisticPrepaymentOverrideRow,
  validateManualMediaMonthsSum,
  type LineOverrideMeta,
} from "../manualBillingOverridesUi.js"
import type { BillingMonth } from "@/lib/billing/types"
import { validateAgencyFeeMonthTotalDrift } from "@/lib/billing/validateAgencyFeeMonthTotalDrift.js"

test("toBillingOverrideLineItemId strips billing- prefix", () => {
  assert.equal(toBillingOverrideLineItemId("billing-search::S-1"), "S-1")
  assert.equal(billingOverrideLineIdsMatch("billing-search::S-1", "S-1"), true)
})

test("computeBillingOverrideDateBasis is stable for the same burst dates", async () => {
  const a = await computeBillingOverrideDateBasis([
    { startDate: "2026-07-01", endDate: "2026-07-31" },
    { startDate: "2026-06-01", endDate: "2026-06-30" },
  ])
  const b = await computeBillingOverrideDateBasis([
    { startDate: "2026-06-01", endDate: "2026-06-30" },
    { startDate: "2026-07-01", endDate: "2026-07-31" },
  ])
  assert.equal(a, b)
  assert.match(a, /^[a-f0-9]{64}$/)
})

test("validateManualMediaMonthsSum blocks non-timing amount changes", () => {
  const ok = validateManualMediaMonthsSum(
    [
      { month: "2026-06", amount: 6000 },
      { month: "2026-07", amount: 4000 },
    ],
    10_000
  )
  assert.equal(ok.ok, true)

  const bad = validateManualMediaMonthsSum([{ month: "2026-06", amount: 9000 }], 10_000)
  assert.equal(bad.ok, false)
  if (bad.ok) return
  assert.match(bad.message, /sum to the line media total/i)
})

test("validateManualMediaMonthsSum skips empty draft (MB-6)", () => {
  // Absent draft must never report "Off by $20,000" against the line total.
  const gate = validateManualMediaMonthsSum([], 20_000)
  assert.equal(gate.ok, true)
})

/**
 * MB-6 regression: after Save billing changes, rebuild draft from persisted overrides
 * (option a) so the open MBA modal keeps month inputs + green sum gate; a second Save
 * must not raise fee-drift against an empty draft.
 */
test("MB-6: rebuild after save keeps month amounts and sum/fee gates green", () => {
  const autoReference: BillingMonth[] = [
    {
      monthYear: "August 2026",
      mediaTotal: "$10,000.00",
      feeTotal: "$2,500.00",
      totalAmount: "$12,500.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: {} as BillingMonth["mediaCosts"],
      lineItems: {
        search: [
          {
            id: "billing-search::supabase001PB1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "August 2026": 10_000, "September 2026": 10_000 },
            feeMonthlyAmounts: { "August 2026": 2500, "September 2026": 2500 },
            totalAmount: 20_000,
            billingMode: "auto",
          },
        ],
      },
    },
    {
      monthYear: "September 2026",
      mediaTotal: "$10,000.00",
      feeTotal: "$2,500.00",
      totalAmount: "$12,500.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: {} as BillingMonth["mediaCosts"],
      lineItems: {
        search: [
          {
            id: "billing-search::supabase001PB1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "August 2026": 10_000, "September 2026": 10_000 },
            feeMonthlyAmounts: { "August 2026": 2500, "September 2026": 2500 },
            totalAmount: 20_000,
            billingMode: "auto",
          },
        ],
      },
    },
  ]

  // Prebill-shaped draft the user just saved (Aug $20k / Sep $0).
  const savedMonths: BillingMonth[] = JSON.parse(JSON.stringify(autoReference))
  for (const m of savedMonths) {
    const li = m.lineItems!.search![0]!
    li.monthlyAmounts = { "August 2026": 20_000, "September 2026": 0 }
    li.feeMonthlyAmounts = { "August 2026": 5000, "September 2026": 0 }
    li.billingMode = "manual"
    li.preBill = true
  }
  // Month header fee totals match the prepaid fee shape (derived campaign fee = $5,000).
  savedMonths[0]!.feeTotal = "$5,000.00"
  savedMonths[1]!.feeTotal = "$0.00"

  const persistedRows = [
    {
      line_item_id: "supabase001PB1",
      component: "media" as const,
      mode: "manual" as const,
      reason: "prepayment",
      date_basis: "basis",
      months: [
        { month: "2026-08", amount: 20_000 },
        { month: "2026-09", amount: 0 },
      ],
    },
  ]

  // Bug path: wipe months but leave draftReady → empty monthYears, false $20k Off-by.
  const strandedEmpty = validateManualMediaMonthsSum([], 20_000)
  assert.equal(strandedEmpty.ok, true, "empty draft must skip media sum gate")
  const strandedFee = validateAgencyFeeMonthTotalDrift([], 5000)
  assert.equal(strandedFee.withinTolerance, true, "empty draft must skip fee drift")

  // Option (a): rebuild from persisted rows over auto reference (mock persist ok).
  const { draftMonths, metaByLine } = rebuildTimingDraftAfterBillingSave({
    savedMonths,
    autoReferenceMonths: autoReference,
    persistedRows,
  })

  assert.equal(draftMonths.length, 2, "modal still has two month rows (inputs)")
  const extracted = extractOverrideMonthsFromSchedule(
    draftMonths,
    "billing-search::supabase001PB1",
    "media"
  )
  assert.deepEqual(extracted, [
    { month: "2026-08", amount: 20_000 },
    { month: "2026-09", amount: 0 },
  ])
  assert.equal(metaByLine.get("supabase001PB1")?.[0]?.reason, "prepayment")

  const sumGate = validateManualMediaMonthsSum(extracted, 20_000)
  assert.equal(sumGate.ok, true, 'sum gate reads "Months match line"')

  // Second Save: fee months from rebuilt draft vs derived $5,000 — no fee-drift dialog.
  const feeMonths: BillingMonth[] = draftMonths.map((m, i) => ({
    ...m,
    feeTotal: savedMonths[i]!.feeTotal,
  }))
  const secondSaveFee = validateAgencyFeeMonthTotalDrift(feeMonths, 5000)
  assert.equal(secondSaveFee.withinTolerance, true)
  assert.equal(secondSaveFee.diff, 0)
})

test("apply + extract round-trip ISO months for media override", () => {
  const months: BillingMonth[] = [
    {
      monthYear: "June 2026",
      mediaTotal: "$0.00",
      feeTotal: "$0.00",
      totalAmount: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: {} as BillingMonth["mediaCosts"],
      lineItems: {
        search: [
          {
            id: "S-1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "June 2026": 5000, "July 2026": 5000 },
            totalAmount: 10_000,
            billingMode: "auto",
          },
        ],
      },
    },
    {
      monthYear: "July 2026",
      mediaTotal: "$0.00",
      feeTotal: "$0.00",
      totalAmount: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: {} as BillingMonth["mediaCosts"],
      lineItems: {
        search: [
          {
            id: "S-1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "June 2026": 5000, "July 2026": 5000 },
            totalAmount: 10_000,
            billingMode: "auto",
          },
        ],
      },
    },
  ]

  const { months: overlaid, metaByLine } = applyBillingOverrideRowsToMonths(months, [
    {
      line_item_id: "S-1",
      component: "media",
      mode: "manual",
      reason: "prepayment",
      date_basis: "abc",
      months: [
        { month: "2026-06", amount: 10_000 },
        { month: "2026-07", amount: 0 },
      ],
    },
  ])

  assert.equal(metaByLine.get("S-1")?.[0]?.dateBasis, "abc")
  assert.equal(metaByLine.get("S-1")?.[0]?.reason, "prepayment")
  const june = overlaid.find((m) => m.monthYear === "June 2026")!
  assert.equal(june.lineItems!.search![0]!.monthlyAmounts["June 2026"], 10_000)
  assert.equal(june.lineItems!.search![0]!.billingMode, "manual")

  const extracted = extractOverrideMonthsFromSchedule(overlaid, "S-1", "media")
  assert.deepEqual(extracted, [
    { month: "2026-06", amount: 10_000 },
    { month: "2026-07", amount: 0 },
  ])
})

test("applyLinePrebillToMonths dumps full media into campaign/draft first month", () => {
  const months: BillingMonth[] = [
    {
      monthYear: "June 2026",
      mediaCosts: { search: "$5,000.00" } as BillingMonth["mediaCosts"],
      mediaTotal: "$5,000.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      totalAmount: "$5,000.00",
      lineItems: {
        search: [
          {
            id: "S-1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "June 2026": 5000, "July 2026": 5000 },
            totalAmount: 10_000,
            billingMode: "auto",
          },
        ],
      },
    },
    {
      monthYear: "July 2026",
      mediaCosts: { search: "$5,000.00" } as BillingMonth["mediaCosts"],
      mediaTotal: "$5,000.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      totalAmount: "$5,000.00",
      lineItems: {
        search: [
          {
            id: "S-1",
            header1: "Google",
            header2: "Search",
            monthlyAmounts: { "June 2026": 5000, "July 2026": 5000 },
            totalAmount: 10_000,
            billingMode: "auto",
          },
        ],
      },
    },
  ]

  applyLinePrebillToMonths(months, "search", "S-1", 10_000)
  assert.equal(months[0]!.lineItems!.search![0]!.monthlyAmounts["June 2026"], 10_000)
  assert.equal(months[0]!.lineItems!.search![0]!.monthlyAmounts["July 2026"], 0)
  assert.equal(months[1]!.lineItems!.search![0]!.monthlyAmounts["June 2026"], 10_000)
  assert.equal(months[1]!.lineItems!.search![0]!.preBill, true)

  const iso = buildPrepaymentOverrideMonths(months, 10_000)
  assert.deepEqual(iso, [
    { month: "2026-06", amount: 10_000 },
    { month: "2026-07", amount: 0 },
  ])

  const meta = new Map<string, LineOverrideMeta[]>()
  upsertLineOverrideMeta(meta, "billing-search::S-1", {
    mode: "manual",
    reason: "prepayment",
    dateBasis: "x",
    component: "media",
  })
  assert.equal(meta.get("billing-search::S-1")?.[0]?.reason, "prepayment")

  const rows = upsertOptimisticPrepaymentOverrideRow([], "billing-search::S-1", iso, "x")
  assert.equal(rows[0]!.reason, "prepayment")
  assert.equal(rows[0]!.line_item_id, "S-1")
})
