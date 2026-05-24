import assert from "node:assert/strict"
import test from "node:test"

import {
  compareBillingDivergence,
  summarizeBillingDivergence,
} from "../compareBillingDivergence.js"
import type { BillingMonth, BillingLineItem } from "@/lib/billing/types"

function line(
  id: string,
  overrides: Partial<BillingLineItem> = {}
): BillingLineItem {
  return {
    id,
    header1: "Network",
    header2: "Site",
    monthlyAmounts: {},
    totalAmount: 0,
    ...overrides,
  }
}

function month(
  monthYear: string,
  overrides: Partial<BillingMonth> & { lines?: Record<string, BillingLineItem[]> } = {}
): BillingMonth {
  const { lines, ...rest } = overrides
  return {
    monthYear,
    mediaTotal: "$0.00",
    feeTotal: "$0.00",
    totalAmount: "$0.00",
    adservingTechFees: "$0.00",
    production: "$0.00",
    mediaCosts: {
      search: "$0.00",
      socialMedia: "$0.00",
      television: "$0.00",
      radio: "$0.00",
      newspaper: "$0.00",
      magazines: "$0.00",
      ooh: "$0.00",
      cinema: "$0.00",
      digiDisplay: "$0.00",
      digiAudio: "$0.00",
      digiVideo: "$0.00",
      bvod: "$0.00",
      integration: "$0.00",
      progDisplay: "$0.00",
      progVideo: "$0.00",
      progBvod: "$0.00",
      progAudio: "$0.00",
      progOoh: "$0.00",
      influencers: "$0.00",
      production: "$0.00",
    },
    lineItems: lines,
    ...rest,
  }
}

test("empty saved and empty computed → not divergent", () => {
  const result = compareBillingDivergence([], [])
  assert.equal(result.isDivergent, false)
  assert.equal(result.divergentLines.length, 0)
  assert.equal(result.divergentMonths.length, 0)
})

test("identical months and line items → not divergent", () => {
  const li = line("li-1", {
    totalAmount: 1000,
    totalFeeAmount: 100,
    monthlyAmounts: { "May 2025": 1000 },
  })
  const rows = [
    month("May 2025", {
      mediaTotal: "$1,000.00",
      feeTotal: "$100.00",
      totalAmount: "$1,100.00",
      lines: { search: [li] },
    }),
  ]
  const saved = JSON.parse(JSON.stringify(rows)) as BillingMonth[]
  const computed = JSON.parse(JSON.stringify(rows)) as BillingMonth[]
  const result = compareBillingDivergence(saved, computed)
  assert.equal(result.isDivergent, false)
})

test("line total differs by $0.02 → divergent line_total", () => {
  const savedLi = line("li-1", { totalAmount: 1000.02 })
  const computedLi = line("li-1", { totalAmount: 1000 })
  const saved = [month("May 2025", { lines: { search: [savedLi] } })]
  const computed = [month("May 2025", { lines: { search: [computedLi] } })]
  const result = compareBillingDivergence(saved, computed)
  assert.equal(result.isDivergent, true)
  assert.equal(result.divergentLines.length, 1)
  assert.equal(result.divergentLines[0]!.kind, "line_total")
})

test("line total differs by $0.005 → not divergent (under tolerance)", () => {
  const savedLi = line("li-1", { totalAmount: 1000.005 })
  const computedLi = line("li-1", { totalAmount: 1000 })
  const saved = [month("May 2025", { lines: { search: [savedLi] } })]
  const computed = [month("May 2025", { lines: { search: [computedLi] } })]
  const result = compareBillingDivergence(saved, computed)
  assert.equal(result.isDivergent, false)
})

test("redistributed across months with same line total → not divergent", () => {
  const savedLi = line("li-1", {
    totalAmount: 5000,
    monthlyAmounts: { "May 2025": 5000, "June 2025": 0 },
  })
  const computedLi = line("li-1", {
    totalAmount: 5000,
    monthlyAmounts: { "May 2025": 0, "June 2025": 5000 },
  })
  const saved = [
    month("May 2025", { mediaTotal: "$0.00", lines: { search: [savedLi] } }),
    month("June 2025", { mediaTotal: "$0.00", lines: { search: [savedLi] } }),
  ]
  const computed = [
    month("May 2025", { mediaTotal: "$0.00", lines: { search: [computedLi] } }),
    month("June 2025", { mediaTotal: "$0.00", lines: { search: [computedLi] } }),
  ]

  const result = compareBillingDivergence(saved, computed)
  assert.equal(result.isDivergent, false)
})

test("line in saved only → missing_in_computed", () => {
  const saved = [month("May 2025", { lines: { search: [line("li-1", { totalAmount: 500 })] } })]
  const computed = [month("May 2025", { lines: { search: [] } })]
  const result = compareBillingDivergence(saved, computed)
  assert.equal(result.isDivergent, true)
  assert.equal(result.divergentLines.length, 1)
  assert.equal(result.divergentLines[0]!.kind, "missing_in_computed")
})

test("line in computed only → missing_in_saved", () => {
  const saved = [month("May 2025", { lines: { search: [] } })]
  const computed = [month("May 2025", { lines: { search: [line("li-1", { totalAmount: 500 })] } })]
  const result = compareBillingDivergence(saved, computed)
  assert.equal(result.isDivergent, true)
  assert.equal(result.divergentLines.length, 1)
  assert.equal(result.divergentLines[0]!.kind, "missing_in_saved")
})

test("month only in saved with positive media → divergentMonths", () => {
  const saved = [month("May 2025", { mediaTotal: "$2,000.00", feeTotal: "$50.00" })]
  const computed: BillingMonth[] = []
  const result = compareBillingDivergence(saved, computed)
  assert.equal(result.isDivergent, true)
  const media = result.divergentMonths.find((m) => m.field === "mediaTotal")
  assert.ok(media)
  assert.equal(media!.savedValue, 2000)
  assert.equal(media!.computedValue, 0)
})

test("feeTotal differs by $1.00 → divergentMonths feeTotal", () => {
  const saved = [month("May 2025", { feeTotal: "$101.00" })]
  const computed = [month("May 2025", { feeTotal: "$100.00" })]
  const result = compareBillingDivergence(saved, computed)
  assert.equal(result.isDivergent, true)
  assert.equal(result.divergentMonths.length, 1)
  assert.equal(result.divergentMonths[0]!.field, "feeTotal")
})

test("summarizeBillingDivergence empty when not divergent", () => {
  const summary = summarizeBillingDivergence({
    isDivergent: false,
    divergentLines: [],
    divergentMonths: [],
  })
  assert.equal(summary.headline, "")
  assert.equal(summary.lineMessages.length, 0)
  assert.equal(summary.monthMessages.length, 0)
})

test("summarizeBillingDivergence singular and plural headlines", () => {
  const oneLine = summarizeBillingDivergence({
    isDivergent: true,
    divergentLines: [
      {
        mediaKey: "search",
        lineItemId: "a",
        header1: "H1",
        header2: "H2",
        savedTotal: 10,
        computedTotal: 0,
        difference: 10,
        kind: "line_total",
      },
    ],
    divergentMonths: [],
  })
  assert.match(oneLine.headline, /1 line item/)

  const oneMonth = summarizeBillingDivergence({
    isDivergent: true,
    divergentLines: [],
    divergentMonths: [
      {
        monthYear: "May 2025",
        field: "feeTotal",
        savedValue: 1,
        computedValue: 0,
        difference: 1,
      },
    ],
  })
  assert.match(oneMonth.headline, /1 month/)

  const many = summarizeBillingDivergence({
    isDivergent: true,
    divergentLines: [
      {
        mediaKey: "search",
        lineItemId: "a",
        header1: "H1",
        header2: "H2",
        savedTotal: 10,
        computedTotal: 0,
        difference: 10,
        kind: "line_total",
      },
      {
        mediaKey: "search",
        lineItemId: "b",
        header1: "H1",
        header2: "H2",
        savedTotal: 20,
        computedTotal: 0,
        difference: 20,
        kind: "line_total",
      },
    ],
    divergentMonths: [
      {
        monthYear: "May 2025",
        field: "feeTotal",
        savedValue: 1,
        computedValue: 0,
        difference: 1,
      },
      {
        monthYear: "June 2025",
        field: "feeTotal",
        savedValue: 2,
        computedValue: 0,
        difference: 2,
      },
    ],
  })
  assert.match(many.headline, /2 line items/)
  assert.match(many.headline, /2 months/)
})
