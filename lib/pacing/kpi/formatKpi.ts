import type { KpiComparison } from "./computeKpiStatus";

/**
 * Formats a decimal ratio (0.014) as a percentage string ("1.40%").
 * Returns "—" (em-dash) for null/undefined.
 */
export function formatRatioAsPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(2)}%`;
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
