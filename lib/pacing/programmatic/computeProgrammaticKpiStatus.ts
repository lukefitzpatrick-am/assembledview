import {
  KPI_TOLERANCE,
  copyForRowKpiStatus,
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

function unsetAsNull(value: number | null | undefined): number | null {
  return value === null || value === undefined || value === 0 ? null : value;
}

function resolveRatioTarget(raw: number | null | undefined): number | null {
  const t = unsetAsNull(raw);
  if (t === null) return null;
  return normaliseRatioTarget(t);
}

function resolveDollarTarget(raw: number | null | undefined): number | null {
  return unsetAsNull(raw);
}

function statusForHigherIsBetter(target: number | null, actual: number | null): SingleKpiStatus {
  if (target === null || target === undefined) return "no-target";
  if (actual === null || actual === undefined) return "no-delivery";
  const threshold = target * (1 - KPI_TOLERANCE);
  return actual >= threshold ? "on-track" : "off-target";
}

function statusForLowerIsBetter(target: number | null, actual: number | null): SingleKpiStatus {
  if (target === null || target === undefined) return "no-target";
  if (actual === null || actual === undefined) return "no-delivery";
  const threshold = target * (1 + KPI_TOLERANCE);
  return actual <= threshold ? "on-track" : "off-target";
}

function variancePercent(target: number | null, actual: number | null): number | null {
  if (target === null || actual === null || target === 0) return null;
  return ((actual - target) / target) * 100;
}

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

  const targetCpv = resolveDollarTarget(targets?.cpv);
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
  if (row.kpiTargets === null) return "kpi-pending";

  const comparisons = buildProgrammaticKpiComparisons(row);

  const hasAnyTarget = comparisons.some((c) => c.status !== "no-target");
  if (!hasAnyTarget) return "kpi-pending";

  const comparable = comparisons.filter(
    (c) => c.status === "on-track" || c.status === "off-target"
  );

  if (comparable.length === 0) return "kpi-no-delivery";

  const onTrackCount = comparable.filter((c) => c.status === "on-track").length;
  const offTargetCount = comparable.filter((c) => c.status === "off-target").length;

  if (onTrackCount > 0 && offTargetCount > 0) return "kpi-mixed";
  if (offTargetCount > 0) return "kpi-off-target";
  return "kpi-on-track";
}
