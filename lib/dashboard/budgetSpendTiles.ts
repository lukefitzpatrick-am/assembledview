/**
 * Budget & Spend tile arithmetic for the campaign summary row.
 * Remaining is on the delivered basis so Budget = Delivered + Remaining.
 */

export type BudgetSpendTileInputs = {
  budget: number
  expectedSpend?: number
  deliveredSpend?: number
}

export type BudgetSpendTileValues = {
  budget: number
  expectedSpend: number | undefined
  deliveredSpend: number | undefined
  /** `budget - deliveredSpend` when delivered is known; otherwise undefined. */
  remaining: number | undefined
}

/**
 * Derive the four Budget & Spend figures.
 * Remaining uses delivered (not expected) so the row reconciles:
 * delivered + remaining === budget when delivered is defined.
 */
export function computeBudgetSpendTileValues(input: BudgetSpendTileInputs): BudgetSpendTileValues {
  const budget = Number.isFinite(input.budget) ? input.budget : 0
  const expectedSpend =
    typeof input.expectedSpend === "number" && Number.isFinite(input.expectedSpend)
      ? input.expectedSpend
      : undefined
  const deliveredSpend =
    typeof input.deliveredSpend === "number" && Number.isFinite(input.deliveredSpend)
      ? input.deliveredSpend
      : undefined
  const remaining = deliveredSpend !== undefined ? budget - deliveredSpend : undefined
  return { budget, expectedSpend, deliveredSpend, remaining }
}
