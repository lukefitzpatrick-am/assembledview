/**
 * Impression-weighted average position.
 * Each row's position is already the day's weighted position from the MART
 * view. Weighting again by that day's impressions rolls the days up. It does
 * not weight the raw country rows a second time.
 */
export function impressionWeightedPosition(
  rows: readonly { position: number | null; impressions: number | null }[],
): number | null {
  let weighted = 0
  let impressions = 0
  for (const row of rows) {
    if (row.position == null || row.impressions == null) continue
    if (!Number.isFinite(row.position) || !Number.isFinite(row.impressions)) continue
    if (row.impressions <= 0) continue
    weighted += row.position * row.impressions
    impressions += row.impressions
  }
  if (impressions === 0) return null
  return weighted / impressions
}
