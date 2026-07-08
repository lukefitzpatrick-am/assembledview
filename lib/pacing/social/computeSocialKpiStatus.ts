import {
  KPI_TOLERANCE,
  copyForRowKpiStatus,
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

/** Social campaign_kpi export uses 0 for unset — treat 0 like null for every metric. */
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

/**
 * Determines status of a single KPI where higher-is-better.
 * 'On-track' means actual >= target * (1 - tolerance).
 */
function statusForHigherIsBetter(target: number | null, actual: number | null): SingleKpiStatus {
  if (target === null || target === undefined) return "no-target";
  if (actual === null || actual === undefined) return "no-delivery";
  const threshold = target * (1 - KPI_TOLERANCE);
  return actual >= threshold ? "on-track" : "off-target";
}

/**
 * CPV is lower-is-better: cheaper than target is good.
 * 'On-track' means actual <= target * (1 + tolerance).
 */
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
 * Builds per-KPI comparisons for a social pacing row.
 *
 * Metrics: ctr, conversionRate (results/impressions), cpv (lower-is-better), vtr.
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

  const targetCpv = resolveDollarTarget(targets?.cpv);
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
  if (row.kpiTargets === null) return "kpi-pending";

  const comparisons = buildSocialKpiComparisons(row);

  const hasAnyTarget = comparisons.some((c) => c.status !== "no-target");
  if (!hasAnyTarget) return "kpi-pending";

  const comparable = comparisons.filter(
    (c) => c.status === "on-track" || c.status === "off-target",
  );

  if (comparable.length === 0) return "kpi-no-delivery";

  const onTrackCount = comparable.filter((c) => c.status === "on-track").length;
  const offTargetCount = comparable.filter((c) => c.status === "off-target").length;

  if (onTrackCount > 0 && offTargetCount > 0) return "kpi-mixed";
  if (offTargetCount > 0) return "kpi-off-target";
  return "kpi-on-track";
}
