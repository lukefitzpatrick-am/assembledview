/**
 * deliverySchedule has TWO shapes on media_plan_versions rows:
 * - 'types' (older/booked): mediaTypes[].lineItems[].amount, mediaCosts/totalAmount = 0.
 * - 'costs' (newer/approved): mediaCosts{channelKey} + totalAmount + mediaTotal + feeTotal, no mediaTypes.
 *
 * The shared normaliser must understand BOTH shapes so sumLineItems / computeSpendFromDelivery
 * don't silently drop 'costs'-shape media (while still not double-counting fees).
 */
import { describe, expect, it } from "vitest"

import {
  normalizeDeliveryEntryMediaBreakdown,
  sumLineItems,
} from "../shared"

describe("normalizeDeliveryEntryMediaBreakdown", () => {
  it("sums 'types'-shape mediaTypes[].lineItems[].amount keyed by media type label", () => {
    const entry = {
      monthYear: "August 2025",
      mediaTypes: [
        {
          mediaType: "Television",
          lineItems: [{ amount: "$1,000.00" }, { amount: "$500.00" }],
        },
        {
          mediaType: "Radio",
          lineItems: [{ amount: "$250.00" }],
        },
      ],
      feeTotal: "$0.00",
    }

    const breakdown = normalizeDeliveryEntryMediaBreakdown(entry)
    expect(breakdown).toEqual({ Television: 1500, Radio: 250 })
  })

  it("sums 'costs'-shape mediaCosts{channelKey} onto the SAME media-type labels charts use", () => {
    const entry = {
      monthYear: "September 2025",
      mediaCosts: {
        television: "$3,000.00",
        bvod: "$1,200.50",
        search: "$0.00",
      },
      mediaTotal: "$4,200.50",
      feeTotal: "$400.00",
      totalAmount: "$4,600.50",
    }

    const breakdown = normalizeDeliveryEntryMediaBreakdown(entry)
    expect(breakdown).toEqual({ Television: 3000, BVOD: 1200.5 })
  })

  it("does NOT double-count mediaCosts.production against the top-level production fee", () => {
    const entry = {
      monthYear: "October 2025",
      mediaCosts: {
        television: "$500.00",
        production: "$100.00", // duplicate breakdown of top-level `production`, must be excluded
      },
      mediaTotal: "$500.00",
      feeTotal: "$0.00",
      production: "$100.00",
      totalAmount: "$600.00",
    }

    const breakdown = normalizeDeliveryEntryMediaBreakdown(entry)
    expect(breakdown).toEqual({ Television: 500 })
  })

  it("returns an empty breakdown for legacy entries with neither mediaTypes nor mediaCosts", () => {
    const entry = { monthYear: "November 2025", amount: "$1,000.00" }
    expect(normalizeDeliveryEntryMediaBreakdown(entry)).toEqual({})
  })
})

describe("sumLineItems", () => {
  it("counts 'costs'-shape media (regression: was previously invisible, only fees counted)", () => {
    const entry = {
      monthYear: "September 2025",
      mediaCosts: {
        television: "$3,000.00",
        bvod: "$1,200.50",
      },
      mediaTotal: "$4,200.50",
      feeTotal: "$400.00",
      adservingTechFees: "$0.00",
      production: "$0.00",
      totalAmount: "$4,600.50",
    }

    // 4200.50 media + 400 fee = 4600.50 (matches entry.totalAmount)
    expect(sumLineItems(entry)).toBeCloseTo(4600.5, 2)
  })

  it("still counts 'types'-shape media the same as before (no regression)", () => {
    const entry = {
      monthYear: "August 2025",
      mediaTypes: [
        { mediaType: "Television", lineItems: [{ amount: "$1,000.00" }] },
      ],
      feeTotal: "$200.00",
      production: "$50.00",
      adservingTechFees: "$10.00",
    }

    expect(sumLineItems(entry)).toBeCloseTo(1260, 2)
  })

  it("does not double-count production for a 'costs'-shape entry with a Production media line", () => {
    const entry = {
      monthYear: "October 2025",
      mediaCosts: {
        television: "$500.00",
        production: "$100.00",
      },
      mediaTotal: "$500.00",
      feeTotal: "$0.00",
      adservingTechFees: "$0.00",
      production: "$100.00",
      totalAmount: "$600.00",
    }

    // 500 media + 0 fee + 100 production (once, not 200) + 0 adserving = 600
    expect(sumLineItems(entry)).toBeCloseTo(600, 2)
  })
})
