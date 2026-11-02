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
import type { ProgrammaticPacingCampaignRow } from "@/lib/pacing/programmatic/types";

export { normaliseRatioTarget };

export type ProgrammaticKpiMetric = "ctr" | "conversionRate" | "cpv" | "vtr";

export type ProgrammaticKpiComparison = {
  metric: ProgrammaticKpiMetric;
  target: number | null;
  actual: number | null;
  variancePercent: number | null;
  status: SingleKpiStatus;
};

export { copyForRowKpiStatus, type RowKpiStatus };

/**
 * Builds per-KPI comparisons for a programmatic pacing row.
 * CPV is lower-is-better; CTR / conversionRate / VTR are higher-is-better.
 * CPM is shown as an actual in the table but has no campaign_kpi target column.
 */
export function buildProgrammaticKpiComparisons(
  row: ProgrammaticPacingCampaignRow
): ProgrammaticKpiComparison[] {
  const targets = row.kpiTargets;

  const targetCtr = resolveRatioTarget(targets?.ctr);
  const actualCtr = row.ctr;
  const ctrComparison: ProgrammaticKpiComparison = {
    metric: "ctr",
    target: targetCtr,
    actual: actualCtr,
    variancePercent: variancePercent(targetCtr, actualCtr),
    status: statusForHigherIsBetter(targetCtr, actualCtr),
  };

  const targetConvRate = resolveRatioTarget(targets?.conversionRate);
  const actualConvRate = row.conversionRate;
  const convRateComparison: ProgrammaticKpiComparison = {
    metric: "conversionRate",
    target: targetConvRate,
    actual: actualConvRate,
    variancePercent: variancePercent(targetConvRate, actualConvRate),
    status: statusForHigherIsBetter(targetConvRate, actualConvRate),
  };

  // C2: the plan CPV rate, never the leftover campaign_kpi.cpv.
  const targetCpv = resolveDollarTarget(row.planCpvRate ?? null);
  const actualCpv = row.cpv;
  const cpvComparison: ProgrammaticKpiComparison = {
    metric: "cpv",
    target: targetCpv,
    actual: actualCpv,
    variancePercent: variancePercent(targetCpv, actualCpv),
    status: statusForLowerIsBetter(targetCpv, actualCpv),
  };

  const targetVtr = resolveRatioTarget(targets?.vtr);
  const actualVtr = row.vtr;
  const vtrComparison: ProgrammaticKpiComparison = {
    metric: "vtr",
    target: targetVtr,
    actual: actualVtr,
    variancePercent: variancePercent(targetVtr, actualVtr),
    status: statusForHigherIsBetter(targetVtr, actualVtr),
  };

  return [ctrComparison, convRateComparison, cpvComparison, vtrComparison];
}

export function computeProgrammaticRowKpiStatus(
  row: ProgrammaticPacingCampaignRow
): RowKpiStatus {
  // A plan CPV is always a target (23 Oct): never "KPI pending" for CPV.
  const hasPlanCpv = row.planCpvRate != null && row.planCpvRate > 0;
  if (row.kpiTargets === null && !hasPlanCpv) return "kpi-pending";

  return reduceRowKpiStatus(buildProgrammaticKpiComparisons(row));
}
