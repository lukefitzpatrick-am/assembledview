/**
 * W5g: Radio's Excel row on the shared container. Format goes out as the
 * creative, package lines keep the saved quantity, the rest are budget over
 * rate unrounded (net of the fee on a fee-inclusive line), and a budget keeps
 * its minus sign as the old container's parser did.
 */
import { describe, expect, it } from "vitest"

import { radioExcelRow } from "@/lib/mediaplan/radioLine"

const row = { startDate: "s", endDate: "e", grossMedia: 1, clientPaysForMedia: false, line_item_id: "x1", line_item: 3 }
const line = (extra: Record<string, unknown>) => ({
  market: "Sydney",
  network: "Nova",
  station: "Nova 100",
  placement: "Breakfast",
  format: "30s live read",
  buyType: "spots",
  ...extra,
})
const pick = (r: Record<string, unknown>) => [r.creative, r.deliverables, r.lineItem]

describe("radioExcelRow (W5g)", () => {
  it("keeps the old Radio columns and deliverables rule", () => {
    const burst = { budget: "$1,000.00", buyAmount: "$30.00", calculatedValue: 7 }
    expect(pick(radioExcelRow(row, line({}), burst, { feePct: 0 }))).toEqual(["30s live read", 1000 / 30, 3])
    expect(pick(radioExcelRow(row, line({ buyType: "package" }), burst, { feePct: 0 }))[1]).toBe(7)
    expect(pick(radioExcelRow(row, line({ budgetIncludesFees: true }), burst, { feePct: 12.5 }))[1]).toBeCloseTo(875 / 30, 9)
    expect(pick(radioExcelRow(row, line({}), { budget: "-$600.00", buyAmount: "$30.00" }, { feePct: 0 }))[1]).toBe(-20)
  })
})
