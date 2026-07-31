/**
 * KPI percent fields (CTR, VTR, conversion_rate):
 * - UI enters/displays percentage points (0.45 means 0.45%)
 * - Storage is a decimal ratio (0.0045)
 *
 * Empty/invalid → null (unset). Never coerce unset to 0.
 */

export type KpiMetricKind = "percent" | "count" | "rate"

/**
 * Parse user percent input as percentage points → stored decimal.
 * Empty/invalid → null.
 */
export function parsePercentHeuristic(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, "").trim()
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const val = parseFloat(cleaned)
  if (!Number.isFinite(val)) return null
  // Percentage points → decimal; fixed precision avoids 0.45/100 float noise.
  return Number((val / 100).toFixed(8))
}

/**
 * Format a stored decimal (or legacy percentage-point value >= 1) for an input field.
 * Null → empty string (blank input).
 */
export function formatPercentForInput(value: number | null): string {
  if (value === null) return ""
  // Legacy: values >= 1 are percentage points already (e.g. 3 means 3%).
  // Domain follow-up: migrate legacy data to decimal form and remove this branch.
  const decimal = value >= 1 ? value / 100 : value
  return `${(decimal * 100).toFixed(2)}%`
}

/**
 * Validate a stored metric value.
 * - percent: null unset; else decimal in [0, 1] (0–100 percentage points)
 * - count (frequency): null unset; else >= 0 (no upper bound — not obvious)
 * - rate (cpv): null unset; else >= 0 dollars (no upper bound — not obvious)
 */
export function validateKpiMetricValue(
  kind: KpiMetricKind,
  value: number | null,
): string | null {
  if (value === null) return null
  if (!Number.isFinite(value)) return "Enter a valid number."
  if (kind === "percent") {
    if (value < 0) return "Targets cannot be negative."
    if (value > 1) return "Percent targets must be between 0 and 100."
    return null
  }
  if (value < 0) return "Targets cannot be negative."
  return null
}
