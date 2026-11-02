import { normaliseRatioTarget } from "@/lib/kpi/normaliseRatioTarget";
import { PACING_STATUS_THRESHOLDS } from "@/lib/pacing/status";
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
export const KPI_TOLERANCE = PACING_STATUS_THRESHOLDS.kpiTolerance;

/**
 * B3 (Q9): the KPI comparison helpers every pacing channel uses (Search,
 * Programmatic, Social). Before this each channel had its own copy, and Search
 * passed a 0 target through as a real target, so `actual >= 0` read "on track".
 */

/** campaign_kpi exports use 0 for "not set": treat 0 like null for every metric. */
export function unsetAsNull(value: number | null | undefined): number | null {
  return value === null || value === undefined || value === 0 ? null : value;
}

/** Ratio target (ctr, conversion rate, vtr): unset (null or 0) → null, else decimal. */
export function resolveRatioTarget(raw: number | null | undefined): number | null {
  const t = unsetAsNull(raw);
  if (t === null) return null;
  return normaliseRatioTarget(t);
}

/** Dollar target (cpv): unset (null or 0) → null. */
export function resolveDollarTarget(raw: number | null | undefined): number | null {
  return unsetAsNull(raw);
}

/**
 * Determines status of a single KPI where higher-is-better.
 * 'On-track' means actual >= target * (1 - tolerance).
 *
 * Returns 'no-target' if target is null (no benchmark set).
 * Returns 'no-delivery' if target exists but actual is null (no Snowflake data).
 */
export function statusForHigherIsBetter(
  target: number | null,
  actual: number | null,
): SingleKpiStatus {
  if (target === null || target === undefined) return "no-target";
  if (actual === null || actual === undefined) return "no-delivery";
  const threshold = target * (1 - KPI_TOLERANCE);
  return actual >= threshold ? "on-track" : "off-target";
}

/**
 * Lower-is-better (cpv): cheaper than target is good.
 * 'On-track' means actual <= target * (1 + tolerance).
 */
export function statusForLowerIsBetter(
  target: number | null,
  actual: number | null,
): SingleKpiStatus {
  if (target === null || target === undefined) return "no-target";
  if (actual === null || actual === undefined) return "no-delivery";
  const threshold = target * (1 + KPI_TOLERANCE);
  return actual <= threshold ? "on-track" : "off-target";
}

/** (actual - target) / target * 100, or null when either is null or target is 0. */
export function variancePercent(target: number | null, actual: number | null): number | null {
  if (target === null || actual === null || target === 0) return null;
  return ((actual - target) / target) * 100;
}

/**
 * The six-state row reduction shared by every channel, once the caller has
 * decided the row has targets at all (`kpiTargets` present, or a plan CPV).
 */
export function reduceRowKpiStatus(
  comparisons: ReadonlyArray<{ status: SingleKpiStatus }>,
): RowKpiStatus {
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
 * Builds the per-KPI comparisons for a single row.
 *
 * Search-relevant metrics today: ctr, conversionRate.
 * Other metrics on KpiTargets (cpv, vtr, frequency) are skipped — they apply to
 * future media types (Social/Video) where the relevant actual will be sourced
 * from the appropriate Snowflake fact.
 *
 * Targets are decimal ratios (AV-25 v2) matching Snowflake actuals (0.045 = 4.5%);
 * a 0 target means "not set". Same helpers as programmatic/social.
 */
export function buildKpiComparisons(row: SearchPacingCampaignRow): KpiComparison[] {
  const targets = row.kpiTargets;

  // Q9: a 0 target is "not set" (KPI pending), same as Programmatic and Social.
  const targetCtr = resolveRatioTarget(targets?.ctr);
  const actualCtr = row.ctr ?? null;
  const ctrComparison: KpiComparison = {
    metric: "ctr",
    target: targetCtr,
    actual: actualCtr,
    variancePercent: variancePercent(targetCtr, actualCtr),
    status: statusForHigherIsBetter(targetCtr, actualCtr),
  };

  const targetConvRate = resolveRatioTarget(targets?.conversionRate);
  const actualConvRate =
    row.clicks > 0 && row.conversions !== null && row.conversions !== undefined
      ? row.conversions / row.clicks
      : null;
  const convRateComparison: KpiComparison = {
    metric: "conversionRate",
    target: targetConvRate,
    actual: actualConvRate,
    variancePercent: variancePercent(targetConvRate, actualConvRate),
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

  return reduceRowKpiStatus(buildKpiComparisons(row));
}

/**
 * Display copy for the row-level pill.
 */
export function copyForRowKpiStatus(status: RowKpiStatus): string {
  switch (status) {
    case "kpi-pending":
      return "KPI pending";
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
