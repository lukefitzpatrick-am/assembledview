/**
 * Parse user percent input. Empty/invalid → null. Whole-number percentage
 * heuristic preserved (8 → 0.08).
 *
 * After 2d-3: returns null for unset, never zero by default.
 */
export function parsePercentHeuristic(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, "").trim()
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const val = parseFloat(cleaned)
  if (!Number.isFinite(val)) return null
  return val > 1 ? val / 100 : val
}

/**
 * Format a percent value for an input field. Null → empty string (blank input).
 */
export function formatPercentForInput(decimal: number | null): string {
  if (decimal === null) return ""
  return `${(decimal * 100).toFixed(2)}%`
}
