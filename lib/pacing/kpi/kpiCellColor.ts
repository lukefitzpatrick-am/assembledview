import { KPI_TOLERANCE } from "./computeKpiStatus";

/**
 * Tailwind class strings for the three KPI cell tint states. Matches the
 * token vocabulary used by KpiStatusPill and StatusCell on the pacing surface.
 */
const TINT_ON_TRACK = "bg-pacing-on-track-bg";
const TINT_OFF_TARGET = "bg-pacing-critical-bg";
const TINT_NO_COMPARISON = "bg-[var(--fill-track)]";

/**
 * Normalise a CTR target to a decimal ratio.
 *
 * `kpiTargets.ctr` is stored in percentage-point form per the KpiTargets
 * type comment (4.5 means 4.5%). Legacy `campaign_kpi` rows may also
 * store it that way. Actuals on the row (e.g. row.ctr) are decimal
 * ratios (0.045 means 4.5%). Without normalisation a target of 4.5
 * vs an actual of 0.045 would compare as "actual is 1% of target"
 * even though both represent the same rate.
 *
 * Mirrors the >= 1 heuristic in formatRatioAsPercent and
 * formatPercentForInput so the cell tint, the popover Target column,
 * and the modal input all agree on the same normalisation.
 */
function normaliseCtrTarget(target: number): number {
  return target >= 1 ? target / 100 : target;
}

/**
 * Return the Tailwind background-class for the CTR cell on a pacing
 * line-item row.
 *
 * - neutral track fill when either the target or the actual is null
 *   (no meaningful comparison possible).
 * - on-track pacing tint when the actual is within KPI_TOLERANCE of
 *   the target — the same threshold the row's KPI pill uses.
 * - critical pacing tint otherwise.
 */
export function ctrCellTint(
  actual: number | null,
  target: number | null,
): string {
  if (actual === null || target === null) return TINT_NO_COMPARISON;
  const normalisedTarget = normaliseCtrTarget(target);
  if (normalisedTarget <= 0) return TINT_NO_COMPARISON;
  const threshold = normalisedTarget * (1 - KPI_TOLERANCE);
  return actual >= threshold ? TINT_ON_TRACK : TINT_OFF_TARGET;
}
