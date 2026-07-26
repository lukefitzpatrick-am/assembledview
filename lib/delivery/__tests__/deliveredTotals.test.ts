/**
 * `combineDeliveredTotals` / `sumDeliveredTotals` / `hasFixedCostMediaLineItems` — the pure
 * composition logic behind the Task 3 "Delivered to date" figure. No Snowflake/Xano mocks
 * needed; the I/O composition lives in `getDeliveredTotalsForCampaign.ts`.
 */
import { describe, expect, it } from "vitest"

import {
  EMPTY_DELIVERED_TOTALS_WITH_AS_OF,
  combineDeliveredTotals,
  hasFixedCostMediaLineItems,
  hasFixedCostMediaTypeLabel,
  hasReportedDeliveredSpend,
  sumDeliveredTotals,
} from "../deliveredTotals"

describe("combineDeliveredTotals", () => {
  it("sums digital spend and fixed-cost totalReported into one delivered spend figure", () => {
    const result = combineDeliveredTotals({ spendToDate: 10_000, impressions: 500_000 }, 4_500)
    expect(result.spendToDate).toBe(14_500)
    expect(result.impressions).toBe(500_000)
    expect(result.hasDelivery).toBe(true)
  })

  it("uses fixed-cost spend alone for direct-media-only campaigns (digital snapshot null)", () => {
    const result = combineDeliveredTotals(null, 7_200)
    expect(result.spendToDate).toBe(7_200)
    expect(result.impressions).toBe(0)
    expect(result.hasDelivery).toBe(true)
  })

  it("treats missing/zero fixed-cost spend as $0, not a fabricated figure", () => {
    const result = combineDeliveredTotals({ spendToDate: 1_000, impressions: 200 }, null)
    expect(result.spendToDate).toBe(1_000)
  })

  it("reports hasDelivery=false when both spend and impressions are zero", () => {
    const result = combineDeliveredTotals({ spendToDate: 0, impressions: 0 }, 0)
    expect(result.hasDelivery).toBe(false)
    expect(result.spendToDate).toBe(0)
  })

  it("reports hasDelivery=true when only impressions are positive (spend still settling)", () => {
    const result = combineDeliveredTotals({ spendToDate: 0, impressions: 1_200 }, 0)
    expect(result.hasDelivery).toBe(true)
  })

  it("never produces NaN/Infinity from non-finite inputs", () => {
    const result = combineDeliveredTotals(
      { spendToDate: Number.NaN, impressions: Number.POSITIVE_INFINITY },
      Number.NaN,
    )
    expect(result.spendToDate).toBe(0)
    expect(result.impressions).toBe(0)
    expect(result.hasDelivery).toBe(false)
  })
})

describe("sumDeliveredTotals", () => {
  it("sums spend and impressions across campaigns and is true if ANY campaign delivered", () => {
    const totals = sumDeliveredTotals([
      { spendToDate: 1_000, impressions: 10_000, hasDelivery: true },
      { spendToDate: 0, impressions: 0, hasDelivery: false },
      { spendToDate: 2_500, impressions: 5_000, hasDelivery: true },
    ])
    expect(totals.spendToDate).toBe(3_500)
    expect(totals.impressions).toBe(15_000)
    expect(totals.hasDelivery).toBe(true)
  })

  it("returns all-zero / false for an empty list (empty-state safe)", () => {
    expect(sumDeliveredTotals([])).toEqual({ spendToDate: 0, impressions: 0, hasDelivery: false })
  })
})

describe("hasFixedCostMediaLineItems", () => {
  it("detects television / radio / newspaper line items", () => {
    expect(hasFixedCostMediaLineItems({ television: [{ id: 1 }] })).toBe(true)
    expect(hasFixedCostMediaLineItems({ radio: [{ id: 1 }] })).toBe(true)
    expect(hasFixedCostMediaLineItems({ newspaper: [{ id: 1 }] })).toBe(true)
  })

  it("returns false for purely-digital line item maps", () => {
    expect(
      hasFixedCostMediaLineItems({ socialMedia: [{ id: 1 }], search: [{ id: 2 }], television: [] }),
    ).toBe(false)
  })

  it("returns false for empty/missing maps without throwing", () => {
    expect(hasFixedCostMediaLineItems({})).toBe(false)
    expect(hasFixedCostMediaLineItems(null)).toBe(false)
    expect(hasFixedCostMediaLineItems(undefined)).toBe(false)
  })
})

describe("hasReportedDeliveredSpend", () => {
  it("is true only for a positive, finite spend figure", () => {
    expect(hasReportedDeliveredSpend(4_500)).toBe(true)
    expect(hasReportedDeliveredSpend(0.01)).toBe(true)
  })

  it("is false for zero spend — even when impressions-only delivery set hasDelivery=true", () => {
    // Regression for MINOR-1: combineDeliveredTotals({ spendToDate: 0, impressions: 1_200 }, 0)
    // reports hasDelivery=true, but there is no real spend figure to render as a dollar amount.
    expect(hasReportedDeliveredSpend(0)).toBe(false)
  })

  it("is false for missing/non-finite values without throwing", () => {
    expect(hasReportedDeliveredSpend(null)).toBe(false)
    expect(hasReportedDeliveredSpend(undefined)).toBe(false)
    expect(hasReportedDeliveredSpend(Number.NaN)).toBe(false)
    expect(hasReportedDeliveredSpend(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe("EMPTY_DELIVERED_TOTALS_WITH_AS_OF", () => {
  it("is a settled 'no delivery yet' payload, never treated as delivered $0", () => {
    // Regression for MAJOR-1: client fetchers must settle to this (not leave state `undefined`)
    // on a non-OK response or fetch failure, so the "Delivered" tile's loading skeleton clears.
    expect(EMPTY_DELIVERED_TOTALS_WITH_AS_OF).toEqual({
      spendToDate: 0,
      impressions: 0,
      hasDelivery: false,
      asOf: "",
    })
    expect(hasReportedDeliveredSpend(EMPTY_DELIVERED_TOTALS_WITH_AS_OF.spendToDate)).toBe(false)
  })
})

describe("hasFixedCostMediaTypeLabel", () => {
  it("detects Television / Radio / Newspaper labels case-insensitively", () => {
    expect(hasFixedCostMediaTypeLabel(["Television"])).toBe(true)
    expect(hasFixedCostMediaTypeLabel(["radio"])).toBe(true)
    expect(hasFixedCostMediaTypeLabel(["NEWSPAPER"])).toBe(true)
    expect(hasFixedCostMediaTypeLabel(["Search", "Television", "BVOD"])).toBe(true)
  })

  it("returns false for purely-digital media type lists", () => {
    expect(hasFixedCostMediaTypeLabel(["Search", "Social Media", "Programmatic Display"])).toBe(false)
  })

  it("returns false for empty/missing lists without throwing", () => {
    expect(hasFixedCostMediaTypeLabel([])).toBe(false)
    expect(hasFixedCostMediaTypeLabel(null)).toBe(false)
    expect(hasFixedCostMediaTypeLabel(undefined)).toBe(false)
  })
})
