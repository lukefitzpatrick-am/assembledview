/**
 * Plan C S2b — balancer math + keep-shape+delta sum gate.
 */
import { describe, expect, it } from "vitest"
import {
  applyKeepShapePlusDelta,
  computeBalancerAmount,
  distributeEvenlyWithBalancer,
  isNegativeBalancer,
  keepShapePlusDeltaPassesSumGate,
  pickDefaultBalancerMonth,
} from "@/lib/finance/billingBalancer"

describe("billingBalancer", () => {
  it("picks the last non-zero auto month as default balancer", () => {
    expect(
      pickDefaultBalancerMonth({
        monthYears: ["May 2026", "June 2026", "July 2026"],
        autoAmountByMonth: {
          "May 2026": 100,
          "June 2026": 200,
          "July 2026": 0,
        },
      })
    ).toBe("June 2026")
  })

  it("falls back to the last month when all auto amounts are zero", () => {
    expect(
      pickDefaultBalancerMonth({
        monthYears: ["May 2026", "June 2026"],
        autoAmountByMonth: { "May 2026": 0, "June 2026": 0 },
      })
    ).toBe("June 2026")
  })

  it("computes balancer as line total minus other months", () => {
    expect(
      computeBalancerAmount({
        lineTotal: 1000,
        amountsByMonth: { "May 2026": 400, "June 2026": 999, "July 2026": 250 },
        balancerMonth: "June 2026",
      })
    ).toBe(350)
  })

  it("distributes evenly with cent residue on the balancer month", () => {
    const out = distributeEvenlyWithBalancer({
      lineTotal: 100,
      monthYears: ["May 2026", "June 2026", "July 2026"],
      balancerMonth: "July 2026",
    })
    // 10000 cents / 3 = 3333 base + 1 remainder → balancer gets 33.34
    expect(out["May 2026"]).toBe(33.33)
    expect(out["June 2026"]).toBe(33.33)
    expect(out["July 2026"]).toBe(33.34)
    const sum = Object.values(out).reduce((s, n) => s + n, 0)
    expect(Number(sum.toFixed(2))).toBe(100)
  })

  it("flags negative balancer amounts", () => {
    expect(isNegativeBalancer(-0.02)).toBe(true)
    expect(isNegativeBalancer(0)).toBe(false)
    expect(isNegativeBalancer(10)).toBe(false)
  })

  it("keep shape + delta preserves manuals and lands residual on balancer", () => {
    const months = applyKeepShapePlusDelta({
      preservedMonths: [
        { month: "2026-05", amount: 400 },
        { month: "2026-06", amount: 300 },
        { month: "2026-07", amount: 300 },
      ],
      newAutoMonths: [
        { month: "2026-05", amount: 350 },
        { month: "2026-06", amount: 350 },
        { month: "2026-07", amount: 400 },
      ],
      balancerMonth: "2026-07",
      newLineTotal: 1100,
    })
    expect(months.find((m) => m.month === "2026-05")).toEqual({
      month: "2026-05",
      amount: 400,
      source: "manual",
    })
    expect(months.find((m) => m.month === "2026-06")).toEqual({
      month: "2026-06",
      amount: 300,
      source: "manual",
    })
    expect(months.find((m) => m.month === "2026-07")).toEqual({
      month: "2026-07",
      amount: 400,
      source: "balancing",
    })
    expect(keepShapePlusDeltaPassesSumGate(months, 1100)).toBe(true)
  })

  it("keep shape + delta with cent residue still passes validateManualMediaMonthsSum", () => {
    const months = applyKeepShapePlusDelta({
      preservedMonths: [
        { month: "2026-05", amount: 33.33 },
        { month: "2026-06", amount: 33.33 },
        { month: "2026-07", amount: 33.34 },
      ],
      newAutoMonths: [
        { month: "2026-05", amount: 0 },
        { month: "2026-06", amount: 0 },
        { month: "2026-07", amount: 100 },
      ],
      balancerMonth: "2026-07",
      newLineTotal: 100.01,
    })
    // manuals kept; balancer = 100.01 − 33.33 − 33.33 = 33.35
    expect(months.find((m) => m.month === "2026-07")?.amount).toBe(33.35)
    expect(months.find((m) => m.month === "2026-07")?.source).toBe("balancing")
    expect(keepShapePlusDeltaPassesSumGate(months, 100.01)).toBe(true)
  })
})
