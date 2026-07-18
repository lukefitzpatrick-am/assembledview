/**
 * Single rule for "delivered spend to date" across dashboard + performance deck.
 * Only a finite positive snapshot total counts as available; otherwise callers show
 * "Not available" (page) / omit a real $ figure (deck).
 */
export function deliveredSpendFromSnapshot(spendToDate: unknown): number | undefined {
  if (typeof spendToDate !== "number" || !Number.isFinite(spendToDate) || spendToDate <= 0) {
    return undefined
  }
  return spendToDate
}

