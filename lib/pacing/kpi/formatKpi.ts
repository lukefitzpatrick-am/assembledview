import type { KpiComparison } from "./computeKpiStatus";

/**
 * Formats a decimal ratio (0.014) as a percentage string ("1.40%").
 * Returns "—" (em-dash) for null/undefined.
 *
 * Defensive heuristic (mirrors formatPercentForInput / parsePercentHeuristic):
 * values > 1 are treated as legacy percentage-point form (3 = 3%, not 0.03).
 */
export function formatRatioAsPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  // Legacy campaign_kpi rows may store CTR / conversion rate as percentage
  // points (3 meaning 3%) rather than decimal ratios (0.03). Without this
  // guard, (3 * 100) produces "300.00%". See Stage 2e-1 / formatPercentForInput.
  const decimal = value >= 1 ? value / 100 : value;
  return `${(decimal * 100).toFixed(2)}%`;
}

/**
 * Formats a variance percentage (already in percent units, e.g. -68.9) with sign.
 * Returns "—" for null. Positive values get a "+" prefix.
 */
export function formatVariancePercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Display label for a KPI metric key.
 */
export function labelForMetric(metric: KpiComparison["metric"]): string {
  switch (metric) {
    case "ctr":
      return "CTR";
    case "conversionRate":
      return "Conversion Rate";
  }
}
