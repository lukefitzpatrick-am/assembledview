/**
 * AV-25 v2 / O5 — KPI ratio percent unit contract.
 *
 * Storage (Xano + Postgres): DECIMAL ratio in [0, 1]
 *   0.01 = 1%, 0.4 = 40%, 1 = 100%.
 * UI enter/display: percentage points (1 means 1%).
 *
 * NEVER infer unit from magnitude (`value >= 1 ? /100`). That heuristic is not
 * invertible — stored 1.0 meaning 100% displayed as 1.00%. Viewability and
 * other 100% targets are normal.
 *
 * Percent-points ↔ decimal conversion lives ONLY in this module.
 * CPV is dollars — never pass it through these helpers.
 *
 * Data migration (both stores) is pending Luke; see KPI_PERCENT_UNIT_CONTRACT.
 */

export const KPI_RATIO_PERCENT_METRICS = [
  "ctr",
  "vtr",
  "conversion_rate",
  "viewability",
] as const

export type KpiRatioPercentMetric = (typeof KPI_RATIO_PERCENT_METRICS)[number]

/**
 * Register row — code assumes decimal storage; dual-store row migration
 * (and ETL reload from fixed Xano) is still pending Luke.
 */
export const KPI_PERCENT_UNIT_CONTRACT = {
  id: "AV-25-v2",
  storage: "decimal",
  ui: "percent_points",
  codeLanded: true,
  dataMigration: "pending_luke",
  /** Values that cannot be classified without a human (old heuristic boundary). */
  ambiguousExactOnes: true,
} as const

/** UI percentage points → stored decimal. Sole ÷100 for KPI ratio metrics. */
export function percentPointsToStoredDecimal(percentPoints: number): number {
  return Number((percentPoints / 100).toFixed(8))
}

/** Stored decimal → UI percentage points. Sole ×100 for KPI ratio metrics. */
export function storedDecimalToPercentPoints(decimal: number): number {
  return decimal * 100
}

/**
 * Read path: stored value is already a decimal ratio.
 * No magnitude heuristic — legacy `>= 1` rows need data migration (O5 scan).
 */
export function asStoredRatioDecimal(stored: number): number {
  return stored
}

/** Format stored decimal ratio as `X.XX%` for inputs / table cells. */
export function formatStoredDecimalAsPercent(decimal: number): string {
  return `${storedDecimalToPercentPoints(decimal).toFixed(2)}%`
}

/**
 * Scan-only classifier (never used to auto-write).
 * `1` / `1.0` is always ambiguous under the old heuristic.
 */
export type InferredKpiPercentUnit =
  | "decimal"
  | "percent_points"
  | "ambiguous_1"
  | "anomalous"
  | "empty"

export function classifyStoredKpiPercentForScan(raw: unknown): {
  inferredUnit: InferredKpiPercentUnit
  currentValue: number | null
  proposedDecimal: number | null
  ambiguous: boolean
} {
  if (raw === null || raw === undefined || raw === "") {
    return {
      inferredUnit: "empty",
      currentValue: null,
      proposedDecimal: null,
      ambiguous: false,
    }
  }
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return {
      inferredUnit: "anomalous",
      currentValue: null,
      proposedDecimal: null,
      ambiguous: false,
    }
  }
  if (n === 0) {
    return {
      inferredUnit: "decimal",
      currentValue: 0,
      proposedDecimal: 0,
      ambiguous: false,
    }
  }
  // Exact 1.0-class: 100% decimal XOR 1% points — human call only.
  if (n === 1) {
    return {
      inferredUnit: "ambiguous_1",
      currentValue: 1,
      proposedDecimal: null,
      ambiguous: true,
    }
  }
  if (n > 0 && n < 1) {
    return {
      inferredUnit: "decimal",
      currentValue: n,
      proposedDecimal: n,
      ambiguous: false,
    }
  }
  if (n > 1 && n <= 100) {
    return {
      inferredUnit: "percent_points",
      currentValue: n,
      proposedDecimal: percentPointsToStoredDecimal(n),
      ambiguous: false,
    }
  }
  return {
    inferredUnit: "anomalous",
    currentValue: n,
    proposedDecimal: null,
    ambiguous: false,
  }
}
