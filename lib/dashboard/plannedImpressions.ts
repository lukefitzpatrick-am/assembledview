/**
 * Planned impression/unit sum across a campaign line-items map.
 * B2 coverage (`sumReportingPlannedImpressions`) is the live strip basis when
 * channel cards exist; this helper remains the all-line-items fallback.
 */
export function sumPlannedImpressionsFromLineItems(
  lineItemsMap: Record<string, unknown[] | undefined> | null | undefined,
): number {
  if (!lineItemsMap || typeof lineItemsMap !== "object") return 0
  let total = 0
  for (const items of Object.values(lineItemsMap)) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!item || typeof item !== "object") continue
      const rec = item as Record<string, unknown>
      const n = Number(
        rec.impressions ?? rec.plannedImpressions ?? rec.units ?? rec.quantity ?? 0,
      )
      if (Number.isFinite(n) && n > 0) total += n
    }
  }
  return total
}
