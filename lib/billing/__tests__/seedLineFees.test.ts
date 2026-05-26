import assert from "node:assert/strict"
import test from "node:test"

import type { BillingBurst, BillingMonth } from "@/lib/billing/types"
import {
  burstsForLineItem,
  prorateBurstFeesToMonths,
  seedBillingMonthsLineFees,
  sliceContainerBurstsForLineItem,
} from "../seedLineFees.js"

function stableId(mediaKey: string, lineItem: any, index: number): string {
  const raw = lineItem?.line_item_id ?? lineItem?.id
  if (raw != null && String(raw).trim() !== "") {
    return `billing-${mediaKey}::${String(raw)}`
  }
  return `billing-${mediaKey}::new-${index}`
}

const emptyMediaCosts = (): BillingMonth["mediaCosts"] => ({
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
})

test("non-client-pays: seeded fee matches sum of burst feeAmount", () => {
  const bursts = [
    {
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      feeAmount: 2000,
      clientPaysForMedia: false,
    },
  ]
  const { totalFeeAmount, feeMonthlyAmounts } = prorateBurstFeesToMonths(bursts, ["May 2026"])
  assert.equal(totalFeeAmount, 2000)
  assert.equal(feeMonthlyAmounts["May 2026"], 2000)
})

test("client_pays_for_media: seeded fee is prorated burst.feeAmount (not $0)", () => {
  const bursts = [
    {
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      feeAmount: 500,
      clientPaysForMedia: true,
    },
  ]
  const { totalFeeAmount } = prorateBurstFeesToMonths(bursts, ["May 2026"])
  assert.equal(totalFeeAmount, 500)
})

test("PD2-style client_pays: $2,000 fee prorated May/June (40/60 split)", () => {
  // May 12–Jun 30 → 20 May days + 30 June days → $800 / $1,200 (glenda007 PD2)
  const bursts = [
    {
      startDate: "2026-05-12",
      endDate: "2026-06-30",
      feeAmount: 2000,
      clientPaysForMedia: true,
    },
  ]
  const { feeMonthlyAmounts, totalFeeAmount } = prorateBurstFeesToMonths(bursts, [
    "May 2026",
    "June 2026",
  ])
  assert.ok(Math.abs(totalFeeAmount - 2000) < 0.02)
  assert.ok(Math.abs((feeMonthlyAmounts["May 2026"] ?? 0) - 800) < 0.02)
  assert.ok(Math.abs((feeMonthlyAmounts["June 2026"] ?? 0) - 1200) < 0.02)
})

test("client_pays line keeps $0 media in billing (synthetic row shape)", () => {
  const months: BillingMonth[] = [
    {
      monthYear: "May 2026",
      mediaTotal: "$0.00",
      feeTotal: "$6,740.00",
      totalAmount: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: emptyMediaCosts(),
      lineItems: {
        progDisplay: [
          {
            id: "billing-progDisplay::glenda007PD1",
            header1: "DV360",
            header2: "test",
            monthlyAmounts: { "May 2026": 3200, "June 2026": 0 },
            totalAmount: 3200,
          },
        ],
      },
    },
    {
      monthYear: "June 2026",
      mediaTotal: "$0.00",
      feeTotal: "$3,360.00",
      totalAmount: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: emptyMediaCosts(),
      lineItems: {
        progDisplay: [
          {
            id: "billing-progDisplay::glenda007PD1",
            header1: "DV360",
            header2: "test",
            monthlyAmounts: { "May 2026": 3200, "June 2026": 4800 },
            totalAmount: 8000,
          },
        ],
      },
    },
  ]

  const lineItems = [
    {
      line_item_id: "glenda007PD1",
      platform: "DV360",
      targeting: "test",
      bursts_json: [
        { startDate: "2026-05-01", endDate: "2026-05-31", feeAmount: "$2,000.00" },
      ],
    },
    {
      line_item_id: "glenda007PD2",
      platform: "DV360",
      targeting: "test",
      client_pays_for_media: true,
      bursts_json: [
        { startDate: "2026-05-12", endDate: "2026-06-30", feeAmount: "$2,000.00" },
      ],
    },
  ]

  const containerBursts: BillingBurst[] = [
    {
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-05-31"),
      mediaAmount: 1200,
      feeAmount: 2000,
      totalAmount: 3200,
      mediaType: "prog display",
      feePercentage: 20,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      deliverables: 0,
      buyType: "cpm",
      noAdserving: false,
    },
    {
      startDate: new Date("2026-05-12"),
      endDate: new Date("2026-06-30"),
      mediaAmount: 8000,
      feeAmount: 2000,
      totalAmount: 10000,
      mediaType: "prog display",
      feePercentage: 20,
      clientPaysForMedia: true,
      budgetIncludesFees: true,
      deliverables: 0,
      buyType: "cpm",
      noAdserving: false,
    },
  ]

  const result = seedBillingMonthsLineFees(
    months,
    [{ billingKey: "progDisplay", lineItems, containerBursts }],
    stableId
  )

  assert.equal(result.linesInjected, 1)
  assert.equal(result.linesSeeded, 2)

  const pd2 = result.months[0]!.lineItems!.progDisplay!.find(
    (li) => li.id === "billing-progDisplay::glenda007PD2"
  )
  assert.ok(pd2)
  assert.equal(pd2.totalAmount, 0)
  assert.equal(pd2.monthlyAmounts["May 2026"], 0)
  assert.equal(pd2.monthlyAmounts["June 2026"], 0)
  assert.ok(pd2.clientPaysForMedia)
  assert.ok(Math.abs((pd2.totalFeeAmount ?? 0) - 2000) < 0.02)
})

test("re-seeds line previously seeded with totalFeeAmount 0 (buggy B1)", () => {
  const months: BillingMonth[] = [
    {
      monthYear: "May 2026",
      mediaTotal: "$0.00",
      feeTotal: "$0.00",
      totalAmount: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: emptyMediaCosts(),
      lineItems: {
        progDisplay: [
          {
            id: "billing-progDisplay::glenda007PD2",
            header1: "DV360",
            header2: "test",
            monthlyAmounts: { "May 2026": 0 },
            totalAmount: 0,
            clientPaysForMedia: true,
            totalFeeAmount: 0,
            feeMonthlyAmounts: { "May 2026": 0 },
          },
        ],
      },
    },
  ]

  const lineItems = [
    {
      line_item_id: "glenda007PD2",
      platform: "DV360",
      targeting: "test",
      client_pays_for_media: true,
      bursts_json: [
        { startDate: "2026-05-01", endDate: "2026-05-31", feeAmount: "$2,000.00" },
      ],
    },
  ]

  const containerBursts: BillingBurst[] = [
    {
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-05-31"),
      mediaAmount: 0,
      feeAmount: 2000,
      totalAmount: 2000,
      mediaType: "prog display",
      feePercentage: 20,
      clientPaysForMedia: true,
      budgetIncludesFees: false,
      deliverables: 0,
      buyType: "cpm",
      noAdserving: false,
    },
  ]

  const result = seedBillingMonthsLineFees(
    months,
    [{ billingKey: "progDisplay", lineItems, containerBursts }],
    stableId
  )
  assert.equal(result.linesSeeded, 1)
  assert.ok(
    Math.abs((result.months[0]!.lineItems!.progDisplay![0]!.totalFeeAmount ?? 0) - 2000) < 0.02
  )
})

test("multi-month burst: fee prorated by day overlap", () => {
  const bursts = [
    {
      startDate: "2026-05-15",
      endDate: "2026-06-15",
      feeAmount: 1000,
      clientPaysForMedia: false,
    },
  ]
  const { feeMonthlyAmounts, totalFeeAmount } = prorateBurstFeesToMonths(bursts, [
    "May 2026",
    "June 2026",
  ])
  assert.ok(feeMonthlyAmounts["May 2026"]! > 0)
  assert.ok(feeMonthlyAmounts["June 2026"]! > 0)
  assert.ok(Math.abs(totalFeeAmount - 1000) < 0.02)
})

test("PD3-style: uses stored feeAmount not inferred 100% fee", () => {
  const lineItems = [
    {
      line_item_id: "glenda007PD3",
      budget_includes_fees: true,
      bursts_json: [
        {
          startDate: "2026-05-01",
          endDate: "2026-05-31",
          budget: "$10,000.00",
          feeAmount: "$1,600.00",
        },
      ],
    },
  ]
  const containerBursts: BillingBurst[] = [
    {
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-05-31"),
      mediaAmount: 8400,
      feeAmount: 1600,
      totalAmount: 10000,
      mediaType: "prog display",
      feePercentage: 20,
      clientPaysForMedia: false,
      budgetIncludesFees: true,
      deliverables: 0,
      buyType: "cpm",
      noAdserving: false,
    },
  ]
  const sources = burstsForLineItem(lineItems[0], 0, lineItems, containerBursts)
  assert.equal(sources[0]!.feeAmount, 1600)
  const { totalFeeAmount } = prorateBurstFeesToMonths(sources, ["May 2026"])
  assert.ok(Math.abs(totalFeeAmount - 1600) < 0.02)
  assert.ok(totalFeeAmount < 5000, "must not infer 100% fee (~$10k)")
})

test("seedBillingMonthsLineFees is idempotent when values already match", () => {
  const months: BillingMonth[] = [
    {
      monthYear: "May 2026",
      mediaTotal: "$0.00",
      feeTotal: "$0.00",
      totalAmount: "$0.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      mediaCosts: emptyMediaCosts(),
      lineItems: {
        progDisplay: [
          {
            id: "billing-progDisplay::glenda007PD1",
            header1: "DV360",
            header2: "test",
            monthlyAmounts: { "May 2026": 3200 },
            totalAmount: 3200,
          },
        ],
      },
    },
  ]

  const lineItems = [
    {
      line_item_id: "glenda007PD1",
      bursts_json: [
        {
          startDate: "2026-05-01",
          endDate: "2026-05-31",
          feeAmount: "$2,000.00",
        },
      ],
    },
  ]
  const containerBursts: BillingBurst[] = [
    {
      startDate: new Date("2026-05-01"),
      endDate: new Date("2026-05-31"),
      mediaAmount: 1200,
      feeAmount: 2000,
      totalAmount: 3200,
      mediaType: "prog display",
      feePercentage: 20,
      clientPaysForMedia: false,
      budgetIncludesFees: false,
      deliverables: 0,
      buyType: "cpm",
      noAdserving: false,
    },
  ]

  const first = seedBillingMonthsLineFees(
    months,
    [{ billingKey: "progDisplay", lineItems, containerBursts }],
    stableId
  )
  assert.equal(first.linesSeeded, 1)
  assert.ok(Math.abs((first.months[0]!.lineItems!.progDisplay![0]!.totalFeeAmount ?? 0) - 2000) < 0.02)

  const second = seedBillingMonthsLineFees(first.months, [
    { billingKey: "progDisplay", lineItems, containerBursts },
  ], stableId)
  assert.equal(second.linesSeeded, 0)
  assert.ok(second.skippedAlreadySeeded >= 1)
})

test("sliceContainerBurstsForLineItem respects line order", () => {
  const lineItems = [
    { bursts_json: [{}, {}] },
    { bursts_json: [{}] },
  ]
  const flat = [{ feeAmount: 1 }, { feeAmount: 2 }, { feeAmount: 3 }] as BillingBurst[]
  const slice = sliceContainerBurstsForLineItem(lineItems, 1, flat)
  assert.equal(slice.length, 1)
  assert.equal(slice[0]!.feeAmount, 3)
})
