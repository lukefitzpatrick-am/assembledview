/**
 * KPI-bar self-consistency: "Planned to date" and "Budget utilized" must be computed from the
 * SAME booked/approved/completed campaign set, so the percentage shown is always exactly
 * `plannedToDate / plannedBudget` for the dollar figures also shown (no more "$55K next to 85%"
 * with no arithmetic relationship between them).
 */
import { describe, expect, it } from "vitest"

import {
  computePlannedSpendTotals,
  isPlannedBasisCampaignStatus,
  type PlannedBasisCampaign,
} from "../plannedSpendConsistency"

describe("isPlannedBasisCampaignStatus", () => {
  it("accepts booked / approved / completed (case- and whitespace-insensitive)", () => {
    expect(isPlannedBasisCampaignStatus("booked")).toBe(true)
    expect(isPlannedBasisCampaignStatus("Approved")).toBe(true)
    expect(isPlannedBasisCampaignStatus("  completed ")).toBe(true)
  })

  it("rejects draft / planning / cancelled / paused and empty values", () => {
    expect(isPlannedBasisCampaignStatus("draft")).toBe(false)
    expect(isPlannedBasisCampaignStatus("planning")).toBe(false)
    expect(isPlannedBasisCampaignStatus("cancelled")).toBe(false)
    expect(isPlannedBasisCampaignStatus("paused")).toBe(false)
    expect(isPlannedBasisCampaignStatus(null)).toBe(false)
    expect(isPlannedBasisCampaignStatus(undefined)).toBe(false)
    expect(isPlannedBasisCampaignStatus("")).toBe(false)
  })
})

describe("computePlannedSpendTotals", () => {
  it("excludes non-planned-basis campaigns from BOTH the numerator and the denominator", () => {
    const campaigns: PlannedBasisCampaign[] = [
      { rawStatus: "booked", spentAmount: 40_000, totalBudget: 80_000 },
      { rawStatus: "approved", spentAmount: 6_750, totalBudget: 20_000 },
      // Draft campaign: must not inflate the budget denominator without a matching numerator.
      { rawStatus: "draft", spentAmount: 0, totalBudget: 500_000 },
      // Cancelled campaign: must not leak into either side.
      { rawStatus: "cancelled", spentAmount: 12_000, totalBudget: 12_000 },
    ]

    const totals = computePlannedSpendTotals(campaigns)

    expect(totals.plannedToDate).toBeCloseTo(46_750, 2)
    expect(totals.plannedBudget).toBeCloseTo(100_000, 2)
    expect(totals.budgetUtilizedPct).toBeCloseTo(46.75, 2)
  })

  it("keeps the reported percentage exactly reconcilable with the two dollar figures", () => {
    const campaigns: PlannedBasisCampaign[] = [
      { rawStatus: "booked", spentAmount: 123_456.78, totalBudget: 250_000 },
      { rawStatus: "completed", spentAmount: 50_000, totalBudget: 50_000 },
    ]

    const totals = computePlannedSpendTotals(campaigns)

    expect(totals.budgetUtilizedPct).toBeCloseTo(
      (totals.plannedToDate / totals.plannedBudget) * 100,
      10,
    )
  })

  it("falls back to null spentAmount as $0 (never NaN) and treats zero budget safely", () => {
    const campaigns: PlannedBasisCampaign[] = [
      { rawStatus: "booked", spentAmount: null, totalBudget: 0 },
    ]

    const totals = computePlannedSpendTotals(campaigns)

    expect(totals.plannedToDate).toBe(0)
    expect(totals.plannedBudget).toBe(0)
    expect(totals.budgetUtilizedPct).toBe(0)
  })

  it("returns all zeros for an empty campaign list (empty-state safe)", () => {
    const totals = computePlannedSpendTotals([])
    expect(totals).toEqual({ plannedToDate: 0, plannedBudget: 0, budgetUtilizedPct: 0 })
  })

  it("clamps monthly amounts so a half-inside campaign contributes only inside months", () => {
    const campaigns: PlannedBasisCampaign[] = [
      {
        rawStatus: "booked",
        spentAmount: 600,
        totalBudget: 600,
        months: [
          { yearMonth: "2026-06", amount: 100 },
          { yearMonth: "2026-07", amount: 200 },
          { yearMonth: "2026-08", amount: 300 },
        ],
      },
    ]
    const totals = computePlannedSpendTotals(campaigns, {
      rangeStartISO: "2026-07-01",
      rangeEndISO: "2027-06-30",
      todayISO: "2026-09-06",
    })
    expect(totals.plannedToDate).toBe(500)
    expect(totals.plannedBudget).toBe(500)
  })

  it("FX-1: with a range, Plan committed is elapsed-in-range ÷ planned-in-range (not itself)", () => {
    const campaigns: PlannedBasisCampaign[] = [
      {
        rawStatus: "booked",
        spentAmount: 300,
        totalBudget: 300,
        months: [
          { yearMonth: "2026-08", amount: 100 },
          { yearMonth: "2026-09", amount: 100 },
          { yearMonth: "2026-10", amount: 100 },
        ],
      },
    ]
    const todayISO = "2026-09-06"

    const past = computePlannedSpendTotals(campaigns, {
      rangeStartISO: "2026-08-01",
      rangeEndISO: "2026-08-31",
      todayISO,
    })
    expect(past.plannedToDate).toBe(100)
    expect(past.plannedBudget).toBe(100)
    expect(past.budgetUtilizedPct).toBe(100)

    const future = computePlannedSpendTotals(campaigns, {
      rangeStartISO: "2026-10-01",
      rangeEndISO: "2026-10-31",
      todayISO,
    })
    expect(future.plannedToDate).toBe(0)
    expect(future.plannedBudget).toBe(100)
    expect(future.budgetUtilizedPct).toBe(0)

    const straddle = computePlannedSpendTotals(campaigns, {
      rangeStartISO: "2026-08-01",
      rangeEndISO: "2026-10-31",
      todayISO,
    })
    expect(straddle.plannedToDate).toBe(200)
    expect(straddle.plannedBudget).toBe(300)
    expect(straddle.budgetUtilizedPct).toBeCloseTo((200 / 300) * 100, 10)
  })

  it("FX-1: without a range, still spentAmount / totalBudget (months ignored)", () => {
    const campaigns: PlannedBasisCampaign[] = [
      {
        rawStatus: "booked",
        spentAmount: 50,
        totalBudget: 200,
        months: [
          { yearMonth: "2026-08", amount: 100 },
          { yearMonth: "2026-09", amount: 100 },
          { yearMonth: "2026-10", amount: 100 },
        ],
      },
    ]
    const totals = computePlannedSpendTotals(campaigns)
    expect(totals.plannedToDate).toBe(50)
    expect(totals.plannedBudget).toBe(200)
    expect(totals.budgetUtilizedPct).toBeCloseTo(25, 10)
  })
})
