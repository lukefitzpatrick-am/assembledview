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
  return val >= 1 ? val / 100 : val
}

/**
 * Format a percent value for an input field. Null → empty string (blank input).
 */
export function formatPercentForInput(value: number | null): string {
  if (value === null) return ""
  // Defensive heuristic mirroring parsePercentHeuristic:
  // values >= 1 are assumed to be in percentage-point form already
  // (legacy data: e.g. stored as 3 to mean 3%, not 0.03; 1 means 1%, not 100%).
  // This avoids double-multiplication producing "300.00%" for value 3.
  // The metrics this formatter is used for (CTR, VTR, conversion_rate)
  // are never legitimately ≥ 100%, so the heuristic is safe.
  // Domain 5 follow-up: migrate legacy data to decimal form and remove this.
  const decimal = value >= 1 ? value / 100 : value
  return `${(decimal * 100).toFixed(2)}%`
}
