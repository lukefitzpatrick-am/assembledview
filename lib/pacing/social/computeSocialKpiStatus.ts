import {
  copyForRowKpiStatus,
  reduceRowKpiStatus,
  resolveDollarTarget,
  resolveRatioTarget,
  statusForHigherIsBetter,
  statusForLowerIsBetter,
  variancePercent,
  type RowKpiStatus,
  type SingleKpiStatus,
} from "@/lib/pacing/kpi/computeKpiStatus";
import { normaliseRatioTarget } from "@/lib/kpi/normaliseRatioTarget";
import type { SocialPacingCampaignRow } from "@/lib/pacing/social/types";

export { normaliseRatioTarget };

export type SocialKpiMetric = "ctr" | "conversionRate" | "cpv" | "vtr";

/**
 * Per-KPI comparison result for social pacing drill-down (2c analogue).
 */
export type SocialKpiComparison = {
  metric: SocialKpiMetric;
  target: number | null;
  actual: number | null;
  variancePercent: number | null; // (actual - target) / target * 100, or null if either is null
  status: SingleKpiStatus;
};

export { copyForRowKpiStatus, type RowKpiStatus };

/**
 * Builds per-KPI comparisons for a social pacing row.
 *
 * Metrics: ctr, conversionRate (results/clicks), cpv (lower-is-better), vtr.
 * Frequency is excluded — social facts have no reach column, so there is no actual.
 */
export function buildSocialKpiComparisons(row: SocialPacingCampaignRow): SocialKpiComparison[] {
  const targets = row.kpiTargets;

  const targetCtr = resolveRatioTarget(targets?.ctr);
  const actualCtr = row.ctr;
  const ctrComparison: SocialKpiComparison = {
    metric: "ctr",
    target: targetCtr,
    actual: actualCtr,
    variancePercent: variancePercent(targetCtr, actualCtr),
    status: statusForHigherIsBetter(targetCtr, actualCtr),
  };

  const targetConvRate = resolveRatioTarget(targets?.conversionRate);
  const actualConvRate = row.conversionRate;
  const convRateComparison: SocialKpiComparison = {
    metric: "conversionRate",
    target: targetConvRate,
    actual: actualConvRate,
    variancePercent: variancePercent(targetConvRate, actualConvRate),
    status: statusForHigherIsBetter(targetConvRate, actualConvRate),
  };

  // C2: the plan CPV rate, never the leftover campaign_kpi.cpv.
  const targetCpv = resolveDollarTarget(row.planCpvRate ?? null);
  const actualCpv = row.cpv;
  const cpvComparison: SocialKpiComparison = {
    metric: "cpv",
    target: targetCpv,
    actual: actualCpv,
    variancePercent: variancePercent(targetCpv, actualCpv),
    status: statusForLowerIsBetter(targetCpv, actualCpv),
  };

  const targetVtr = resolveRatioTarget(targets?.vtr);
  const actualVtr = row.vtr;
  const vtrComparison: SocialKpiComparison = {
    metric: "vtr",
    target: targetVtr,
    actual: actualVtr,
    variancePercent: variancePercent(targetVtr, actualVtr),
    status: statusForHigherIsBetter(targetVtr, actualVtr),
  };

  return [ctrComparison, convRateComparison, cpvComparison, vtrComparison];
}

/**
 * Reduces per-KPI comparisons to a single row-level status (same six-state
 * reduction as Search's computeRowKpiStatus).
 */
export function computeSocialRowKpiStatus(row: SocialPacingCampaignRow): RowKpiStatus {
  // A plan CPV is always a target (23 Oct): never "KPI pending" for CPV.
  const hasPlanCpv = row.planCpvRate != null && row.planCpvRate > 0;
  if (row.kpiTargets === null && !hasPlanCpv) return "kpi-pending";

  return reduceRowKpiStatus(buildSocialKpiComparisons(row));
}
