import { KPI_TOLERANCE } from "./computeKpiStatus";

/**
 * Tailwind class strings for the three KPI cell tint states. Matches the
 * translucent /15 vocabulary used by KpiStatusPill and StatusCell on the
 * pacing surface — see components/pacing-search and
 * components/dashboard/delivery/shared/statusColours.ts.
 */
const TINT_ON_TRACK = "bg-emerald-500/15";
const TINT_OFF_TARGET = "bg-rose-500/15";
const TINT_NO_COMPARISON = "bg-sky-500/15";

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
 * - `bg-sky-500/15` when either the target or the actual is null
 *   (no meaningful comparison possible).
 * - `bg-emerald-500/15` when the actual is within KPI_TOLERANCE of
 *   the target — the same threshold the row's KPI pill uses.
 * - `bg-rose-500/15` otherwise.
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
