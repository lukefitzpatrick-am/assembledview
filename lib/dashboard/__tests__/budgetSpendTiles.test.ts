import { describe, expect, it } from "vitest"

import { computeBudgetSpendTileValues } from "@/lib/dashboard/budgetSpendTiles"

describe("computeBudgetSpendTileValues", () => {
  it("reconciles Delivered + Remaining to Budget (Jayco NZ fixture)", () => {
    const budget = 43_000
    const expectedSpend = 25_000
    const deliveredSpend = 22_000

    const tiles = computeBudgetSpendTileValues({ budget, expectedSpend, deliveredSpend })

    expect(tiles.budget).toBe(43_000)
    expect(tiles.expectedSpend).toBe(25_000)
    expect(tiles.deliveredSpend).toBe(22_000)
    expect(tiles.remaining).toBe(21_000)
    // Remaining is on the delivered basis — row adds up.
    expect(tiles.deliveredSpend! + tiles.remaining!).toBe(tiles.budget)
    // Expected is independent; does not define remaining.
    expect(tiles.remaining).not.toBe(budget - expectedSpend)
  })

  it("leaves remaining undefined when delivery is unknown", () => {
    const tiles = computeBudgetSpendTileValues({
      budget: 43_000,
      expectedSpend: 25_000,
    })
    expect(tiles.remaining).toBeUndefined()
    expect(tiles.deliveredSpend).toBeUndefined()
  })
})
