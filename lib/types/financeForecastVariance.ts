/**
 * Finance Forecast snapshot variance — pure comparison outputs (no UI).
 */

import type {
  FinanceForecastGroupKey,
  FinanceForecastLineKey,
  FinanceForecastMonthKey,
} from "@/lib/types/financeForecast"
import type { FinanceForecastSnapshotLineRecord } from "@/lib/types/financeForecastSnapshot"

export type FinanceForecastVarianceChangeType = "new" | "removed" | "increased" | "decreased" | "unchanged"

/** Signals used for forecast variance attribution (conservative; not all appear on every row). */
export type FinanceForecastVarianceDriverCode =
  | "version_number_increased"
  | "campaign_status_changed"
  | "billing_schedule_changed"
  | "delivery_schedule_changed"
  | "campaign_dates_changed"
  | "publisher_fee_changed"
  | "client_fee_changed"
  | "line_item_added"
  | "line_item_removed"
  | "source_inputs_unclear"

export interface FinanceForecastVarianceAttribution {
  /** Single short sentence for UI; always set. */
  explanation: string
  confidence: "high" | "medium" | "low"
  drivers: FinanceForecastVarianceDriverCode[]
}

/** Snapshot A vs B input (lines only; headers optional on record). */
export interface FinanceForecastSnapshotVarianceInput {
  snapshot_id: string
  /** e.g. `snapshot_label` from stored header */
  label?: string
  lines: FinanceForecastSnapshotLineRecord[]
}

/** Provenance carried through for UI explanations. */
export interface FinanceForecastVarianceSourceSide {
  line_record_id?: string
  source_hash?: string | null
  source_debug_json?: string | null
}

export interface FinanceForecastVarianceCore {
  old_amount: number | null
  new_amount: number | null
  /** `(new_amount ?? 0) - (old_amount ?? 0)` */
  absolute_change: number
  /** Only when both sides present and `old_amount !== 0`; else `null`. */
  percent_change: number | null
  change_type: FinanceForecastVarianceChangeType
}

export interface FinanceForecastVarianceMonthLineRow extends FinanceForecastVarianceCore {
  level: "month_line"
  client_id: string
  client_name: string
  mba_number: string | null
  campaign_id: string | null
  media_plan_version_id: string | null
  version_number: number | null
  group_key: FinanceForecastGroupKey
  line_key: FinanceForecastLineKey
  month_key: FinanceForecastMonthKey
  baseline: FinanceForecastVarianceSourceSide | null
  comparison: FinanceForecastVarianceSourceSide | null
  /** Best-effort driver of the change; conservative when evidence is weak. */
  attribution?: FinanceForecastVarianceAttribution
}

export interface FinanceForecastVarianceFyLineRow extends FinanceForecastVarianceCore {
  level: "fy_line"
  client_id: string
  client_name: string
  mba_number: string | null
  campaign_id: string | null
  media_plan_version_id: string | null
  version_number: number | null
  group_key: FinanceForecastGroupKey
  line_key: FinanceForecastLineKey
  /** Sum of monthly amounts (equals logical-line FY total). */
  baseline: FinanceForecastVarianceSourceSide | null
  comparison: FinanceForecastVarianceSourceSide | null
}

export interface FinanceForecastVarianceClientRow extends FinanceForecastVarianceCore {
  level: "client"
  client_id: string
  client_name: string
  baseline: FinanceForecastVarianceSourceSide | null
  comparison: FinanceForecastVarianceSourceSide | null
}

export interface FinanceForecastVarianceRowGroupRow extends FinanceForecastVarianceCore {
  level: "row_group"
  group_key: FinanceForecastGroupKey
  baseline: FinanceForecastVarianceSourceSide | null
  comparison: FinanceForecastVarianceSourceSide | null
}

export interface FinanceForecastVarianceLineItemRow extends FinanceForecastVarianceCore {
  level: "line_item"
  group_key: FinanceForecastGroupKey
  line_key: FinanceForecastLineKey
  baseline: FinanceForecastVarianceSourceSide | null
  comparison: FinanceForecastVarianceSourceSide | null
}

export interface FinanceForecastVarianceMonthRow extends FinanceForecastVarianceCore {
  level: "month"
  month_key: FinanceForecastMonthKey
  baseline: FinanceForecastVarianceSourceSide | null
  comparison: FinanceForecastVarianceSourceSide | null
}

export interface FinanceForecastVarianceFyTotalRow extends FinanceForecastVarianceCore {
  level: "fy_total"
  /**
   * Portfolio-level row: per-side source refs are omitted (aggregate of all lines).
   * Use `by_month_line` / `by_fy_line` for `source_hash` / `source_debug_json`.
   */
  baseline: FinanceForecastVarianceSourceSide | null
  comparison: FinanceForecastVarianceSourceSide | null
}

export interface FinanceForecastVarianceReport {
  baseline_snapshot_id: string
  comparison_snapshot_id: string
  baseline_label?: string
  comparison_label?: string
  by_month_line: FinanceForecastVarianceMonthLineRow[]
  by_fy_line: FinanceForecastVarianceFyLineRow[]
  by_client: FinanceForecastVarianceClientRow[]
  by_row_group: FinanceForecastVarianceRowGroupRow[]
  by_line_item: FinanceForecastVarianceLineItemRow[]
  by_month: FinanceForecastVarianceMonthRow[]
  fy_total: FinanceForecastVarianceFyTotalRow
}

export type CompareFinanceForecastVarianceOptions = {
  /** Include rows where amounts match and both sides exist (can be large). Default false. */
  include_unchanged?: boolean
  /** Treat |delta| <= epsilon as unchanged for classification. Default 0. */
  amount_epsilon?: number
}
