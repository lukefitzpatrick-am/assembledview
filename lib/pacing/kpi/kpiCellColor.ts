import { KPI_TOLERANCE } from "./computeKpiStatus"
import { asStoredRatioDecimal } from "@/lib/kpi/percentUnits"

/**
 * Tailwind class strings for the three KPI cell tint states. Matches the
 * token vocabulary used by KpiStatusPill and StatusCell on the pacing surface.
 */
const TINT_ON_TRACK = "bg-pacing-on-track-bg"
const TINT_OFF_TARGET = "bg-pacing-critical-bg"
const TINT_NO_COMPARISON = "bg-[var(--fill-track)]"

/**
 * Return the Tailwind background-class for the CTR cell on a pacing
 * line-item row.
 *
 * - neutral track fill when either the target or the actual is null
 *   (no meaningful comparison possible).
 * - on-track pacing tint when the actual is within KPI_TOLERANCE of
 *   the target — the same threshold the row's KPI pill uses.
 * - critical pacing tint otherwise.
 *
 * Target must be decimal storage (AV-25 v2); threshold comparison uses
 * `asStoredRatioDecimal` — never a magnitude heuristic.
 */
export function ctrCellTint(
  actual: number | null,
  target: number | null,
): string {
  if (actual === null || target === null) return TINT_NO_COMPARISON
  const normalisedTarget = asStoredRatioDecimal(target)
  if (normalisedTarget <= 0) return TINT_NO_COMPARISON
  const threshold = normalisedTarget * (1 - KPI_TOLERANCE)
  return actual >= threshold ? TINT_ON_TRACK : TINT_OFF_TARGET
}
