/**
 * Persisted Finance Forecast snapshot model — aligned with Xano tables
 * `finance_forecast_snapshots` and `finance_forecast_snapshot_lines`.
 *
 * Snapshots are immutable audit copies of a **calculated** forecast dataset at `taken_at`.
 * They do not reference or alter `media_plan_versions` rows.
 */

import type {
  FinanceForecastGroupKey,
  FinanceForecastLineKey,
  FinanceForecastMonthKey,
  FinanceForecastScenario,
} from "@/lib/types/financeForecast"

// ---------------------------------------------------------------------------
// Snapshot header (table: finance_forecast_snapshots)
// ---------------------------------------------------------------------------

/** How the snapshot was created (extend in Xano enum as needed). */
export type FinanceForecastSnapshotType =
  | "manual"
  | "scheduled"
  | "month_close"
  | "adhoc"
  | string

/**
 * One row per saved forecast capture.
 * After insert, rows MUST NOT be updated (immutability enforced in Xano API / policies).
 */
export interface FinanceForecastSnapshotRecord {
  id: string
  snapshot_label: string
  snapshot_type: FinanceForecastSnapshotType
  /** Australian FY: calendar year in which the financial year starts (1 July). */
  financial_year: number
  scenario: FinanceForecastScenario
  /** ISO-8601 timestamp when the snapshot was taken. */
  taken_at: string
  /** Auth subject, email, or display identifier of the user who captured the snapshot. */
  taken_by: string | null
  notes: string | null
  /**
   * Opaque summary of upstream version coverage at capture time (JSON stringrecommended).
   * E.g. `{ "filtered_version_count": 42, "raw_version_count": 100, "client_scope": "all" }`
   */
  source_version_summary: string | null
  /**
   * Optional JSON string: UI/API filters active when the dataset was computed (client filter, search, debug).
   * Not used for comparison logic — comparison uses line rows only.
   */
  filter_context_json?: string | null
  /** Xano `created_at` when present. */
  created_at?: string
}

export type FinanceForecastSnapshotInsert = Omit<FinanceForecastSnapshotRecord, "id" | "created_at">

// ---------------------------------------------------------------------------
// Snapshot lines (table: finance_forecast_snapshot_lines)
// ---------------------------------------------------------------------------

/**
 * Normalised grain: one row per (snapshot × version row × forecast line × fiscal month).
 * Enables comparisons by client, line category (`group_key` + `line_key`), and `month_key`.
 */
export interface FinanceForecastSnapshotLineRecord {
  id: string
  snapshot_id: string
  client_id: string
  client_name: string
  campaign_id: string | null
  mba_number: string | null
  media_plan_version_id: string | number | null
  version_number: number | null
  group_key: FinanceForecastGroupKey
  line_key: FinanceForecastLineKey
  month_key: FinanceForecastMonthKey
  /** Amount for this month (AUD); numeric in DB. */
  amount: number
  /** FY total for the logical forecast line (repeated on each month row for convenient aggregates). */
  fy_total: number
  /** SHA-256 hex of canonical line payload for integrity / drift detection. */
  source_hash: string | null
  /** JSON string of `FinanceForecastLine.debug` when captured; null if not collected. */
  source_debug_json: string | null
}

export type FinanceForecastSnapshotLineInsert = Omit<FinanceForecastSnapshotLineRecord, "id">

// ---------------------------------------------------------------------------
// Comparison / variance (derived — not a DB table)
// ---------------------------------------------------------------------------

/** Natural key for month-level diff between two snapshots. */
export type FinanceForecastSnapshotComparisonKey = {
  client_id: string
  media_plan_version_id: string | null
  group_key: FinanceForecastGroupKey
  line_key: FinanceForecastLineKey
  month_key: FinanceForecastMonthKey
}

export interface FinanceForecastSnapshotLineDelta {
  key: FinanceForecastSnapshotComparisonKey
  client_name: string
  mba_number: string | null
  baseline_amount: number
  comparison_amount: number
  delta: number
  baseline_snapshot_id: string
  comparison_snapshot_id: string
}

export interface FinanceForecastSnapshotMonthlyRollupDelta {
  month_key: FinanceForecastMonthKey
  baseline_total: number
  comparison_total: number
  delta: number
}

export interface FinanceForecastSnapshotClientRollupDelta {
  client_id: string
  client_name: string
  baseline_total: number
  comparison_total: number
  delta: number
}

export interface FinanceForecastSnapshotLineCategoryRollupDelta {
  group_key: FinanceForecastGroupKey
  line_key: FinanceForecastLineKey
  baseline_total: number
  comparison_total: number
  delta: number
}

/** Staging payload: header without DB id + lines without ids / snapshot_id. */
export interface FinanceForecastSnapshotStagingPayload {
  header: FinanceForecastSnapshotInsert
  lines: Array<Omit<FinanceForecastSnapshotLineInsert, "snapshot_id">>
}

/** Helpers typing: dataset fingerprint for audit (optional). */
export type FinanceForecastDatasetFingerprint = {
  /** Hash of serialised client_blocks + meta for quick equality checks. */
  dataset_hash: string
  /** Line count after normalisation (months × logical lines). */
  line_row_count: number
}
