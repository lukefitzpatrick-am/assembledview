import { normaliseRatioTarget } from "@/lib/kpi/normaliseRatioTarget";
import type { SearchPacingCampaignRow } from "@/lib/pacing/campaigns/types";

/**
 * Status of a single KPI metric vs its target.
 * - 'on-track' — actual is within 10% of target in the favourable direction or better
 * - 'off-target' — actual is below the tolerance threshold
 * - 'no-target' — target is null on campaign_kpi (no benchmark to compare against)
 * - 'no-delivery' — target exists but actual is null (zero delivery so far)
 */
export type SingleKpiStatus = "on-track" | "off-target" | "no-target" | "no-delivery";

/**
 * Row-level summary of KPI status across all relevant metrics for the row.
 * - 'kpi-pending' — kpiTargets is null entirely (no campaign_kpi row joined)
 * - 'kpi-no-delivery' — targets exist but the row has no Snowflake delivery data yet
 * - 'kpi-on-track' — all relevant KPIs with both target and actual are on-track
 * - 'kpi-mixed' — some relevant KPIs on-track, some off
 * - 'kpi-off-target' — all relevant KPIs with both target and actual are off
 */
export type RowKpiStatus =
  | "kpi-pending"
  | "kpi-no-delivery"
  | "kpi-on-track"
  | "kpi-mixed"
  | "kpi-off-target";

/**
 * Per-KPI comparison result. Exposed for 2c's drill-down panel.
 */
export type KpiComparison = {
  metric: "ctr" | "conversionRate";
  target: number | null;
  actual: number | null;
  variancePercent: number | null; // (actual - target) / target * 100, or null if either is null
  status: SingleKpiStatus;
};

/**
 * Tolerance in percentage points relative to target.
 * 0.10 = within 10% below target counts as on-track.
 */
export const KPI_TOLERANCE = 0.10;

/**
 * Determines status of a single KPI where higher-is-better.
 * 'On-track' means actual >= target * (1 - tolerance).
 *
 * Returns 'no-target' if target is null (no benchmark set).
 * Returns 'no-delivery' if target exists but actual is null (no Snowflake data).
 */
function statusForHigherIsBetter(target: number | null, actual: number | null): SingleKpiStatus {
  if (target === null || target === undefined) return "no-target";
  if (actual === null || actual === undefined) return "no-delivery";
  const threshold = target * (1 - KPI_TOLERANCE);
  return actual >= threshold ? "on-track" : "off-target";
}

/**
 * Builds the per-KPI comparisons for a single row.
 *
 * Search-relevant metrics today: ctr, conversionRate.
 * Other metrics on KpiTargets (cpv, vtr, frequency) are skipped — they apply to
 * future media types (Social/Video) where the relevant actual will be sourced
 * from the appropriate Snowflake fact.
 *
 * Targets may be legacy percentage-points (>= 1); normalise to decimal ratios so
 * they match Snowflake actuals (0.045 = 4.5%). Same helper as programmatic/social.
 */
export function buildKpiComparisons(row: SearchPacingCampaignRow): KpiComparison[] {
  const targets = row.kpiTargets;

  const rawCtr = targets?.ctr ?? null;
  const targetCtr = rawCtr != null ? normaliseRatioTarget(rawCtr) : null;
  const actualCtr = row.ctr ?? null;
  const ctrComparison: KpiComparison = {
    metric: "ctr",
    target: targetCtr,
    actual: actualCtr,
    variancePercent:
      targetCtr !== null && actualCtr !== null && targetCtr !== 0
        ? ((actualCtr - targetCtr) / targetCtr) * 100
        : null,
    status: statusForHigherIsBetter(targetCtr, actualCtr),
  };

  const rawConvRate = targets?.conversionRate ?? null;
  const targetConvRate = rawConvRate != null ? normaliseRatioTarget(rawConvRate) : null;
  const actualConvRate =
    row.clicks > 0 && row.conversions !== null && row.conversions !== undefined
      ? row.conversions / row.clicks
      : null;
  const convRateComparison: KpiComparison = {
    metric: "conversionRate",
    target: targetConvRate,
    actual: actualConvRate,
    variancePercent:
      targetConvRate !== null && actualConvRate !== null && targetConvRate !== 0
        ? ((actualConvRate - targetConvRate) / targetConvRate) * 100
        : null,
    status: statusForHigherIsBetter(targetConvRate, actualConvRate),
  };

  return [ctrComparison, convRateComparison];
}

/**
 * Reduces the per-KPI comparisons to a single row-level status.
 *
 * Rules (in priority order):
 *   1. If kpiTargets is null entirely → 'kpi-pending'
 *   2. If every relevant KPI is 'no-target' → still 'kpi-pending' (no benchmark
 *      for any metric we care about, even though the campaign_kpi row exists —
 *      e.g. row was created with all Search-relevant fields empty)
 *   3. If every relevant KPI with a target shows 'no-delivery' → 'kpi-no-delivery'
 *   4. If at least one is 'on-track' and at least one is 'off-target' → 'kpi-mixed'
 *   5. If all comparable KPIs are 'on-track' → 'kpi-on-track'
 *   6. If all comparable KPIs are 'off-target' → 'kpi-off-target'
 *
 * 'Comparable' = both target and actual are present.
 */
export function computeRowKpiStatus(row: SearchPacingCampaignRow): RowKpiStatus {
  if (row.kpiTargets === null) return "kpi-pending";

  const comparisons = buildKpiComparisons(row);

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

/**
 * Display copy for the row-level pill.
 */
export function copyForRowKpiStatus(status: RowKpiStatus): string {
  switch (status) {
    case "kpi-pending":
      return "KPI Pending";
    case "kpi-no-delivery":
      return "No delivery";
    case "kpi-on-track":
      return "KPIs on track";
    case "kpi-mixed":
      return "KPIs mixed";
    case "kpi-off-target":
      return "KPIs off";
  }
}
