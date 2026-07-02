import assert from "node:assert/strict"
import test from "node:test"

import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import {
  buildBillingLineAdjustmentMaps,
  getBillingCellAdjustmentKind,
} from "../billingLineAdjustmentIndicators.js"

function line(id: string, overrides: Partial<BillingLineItem> = {}): BillingLineItem {
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
  lines?: Record<string, BillingLineItem[]>
): BillingMonth {
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
  }
}

test("manual billingMode marks entire line manual regardless of auto reference", () => {
  const working = [
    month("May 2026", {
      search: [
        line("li-1", {
          billingMode: "manual",
          monthlyAmounts: { "May 2026": 500 },
          totalAmount: 500,
        }),
      ],
    }),
  ]
  const auto = [
    month("May 2026", {
      search: [line("li-1", { monthlyAmounts: { "May 2026": 1000 }, totalAmount: 1000 })],
    }),
  ]

  const maps = buildBillingLineAdjustmentMaps(working, auto)
  assert.equal(getBillingCellAdjustmentKind(maps, "li-1", "May 2026"), "manual")
  assert.equal(maps.divergentCells.size, 0)
})

test("auto line with per-month amount drift is divergent not manual", () => {
  const working = [
    month("May 2026", {
      search: [
        line("li-1", {
          billingMode: "auto",
          monthlyAmounts: { "May 2026": 500 },
          totalAmount: 500,
        }),
      ],
    }),
  ]
  const auto = [
    month("May 2026", {
      search: [line("li-1", { monthlyAmounts: { "May 2026": 1000 }, totalAmount: 1000 })],
    }),
  ]

  const maps = buildBillingLineAdjustmentMaps(working, auto)
  assert.equal(getBillingCellAdjustmentKind(maps, "li-1", "May 2026"), "divergent")
})

test("legacy undefined billingMode with drift is divergent", () => {
  const working = [
    month("May 2026", {
      search: [line("li-1", { monthlyAmounts: { "May 2026": 500 }, totalAmount: 500 })],
    }),
  ]
  const auto = [
    month("May 2026", {
      search: [line("li-1", { monthlyAmounts: { "May 2026": 1000 }, totalAmount: 1000 })],
    }),
  ]

  const maps = buildBillingLineAdjustmentMaps(working, auto)
  assert.equal(getBillingCellAdjustmentKind(maps, "li-1", "May 2026"), "divergent")
})

test("matching amounts within tolerance are not flagged", () => {
  const working = [
    month("May 2026", {
      search: [
        line("li-1", {
          billingMode: "auto",
          monthlyAmounts: { "May 2026": 1000.005 },
          totalAmount: 1000.005,
        }),
      ],
    }),
  ]
  const auto = [
    month("May 2026", {
      search: [line("li-1", { monthlyAmounts: { "May 2026": 1000 }, totalAmount: 1000 })],
    }),
  ]

  const maps = buildBillingLineAdjustmentMaps(working, auto)
  assert.equal(getBillingCellAdjustmentKind(maps, "li-1", "May 2026"), null)
})
