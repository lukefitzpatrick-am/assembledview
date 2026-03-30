import type {
  FinanceForecastGroupKey,
  FinanceForecastLineKey,
} from "@/lib/types/financeForecast"

/**
 * Where a value is read from when building forecast rows.
 * Used by mapping definitions, snapshot, and variance tooling for consistent provenance.
 */
export type ForecastMappingEntity = "media_plan_versions" | "publishers" | "clients" | "billing_schedule_json"

export interface ForecastSourceFieldRef {
  entity: ForecastMappingEntity
  /** Xano / JSON field names (snake_case or camelCase as stored). */
  fields: readonly string[]
  /** How the field is interpreted in the forecast pipeline. */
  role: string
}

/**
 * Static documentation for one forecast line key — safe to ship to UI (tooltips, exports).
 */
export interface ForecastLineMappingDefinition {
  line_key: FinanceForecastLineKey
  /** Short title for engineers / admin screens. */
  summary: string
  /** Plain-language business rule this row represents. */
  businessRule: string
  /** Ordered list of source fields consulted (best-effort; may be indirect via helpers). */
  sourceFields: readonly ForecastSourceFieldRef[]
  /**
   * If true, amounts are still placeholders or zero until schema/product rules are finalised.
   * Central checklist lives in `FORECAST_MAPPING_SCHEMA_GAPS` in definitions.ts.
   */
  incomplete?: boolean
}

/**
 * Runtime row config used by calculators/orderers.
 * Keep this as the single place to add future forecast rows.
 */
export interface ForecastRowDefinition extends ForecastLineMappingDefinition {
  /** Stable row identifier (same value used in dataset lines). */
  key: FinanceForecastLineKey
  /** UI label (must match product copy in FINANCE_FORECAST_LINE_LABELS). */
  label: string
  /** Billing or revenue group bucket. */
  group: FinanceForecastGroupKey
  /** In-group display order (ascending). */
  sortOrder: number
  /**
   * Human-readable pointer to the primary calculator logic.
   * Example: "buildLinesForCampaign#publisher_comms_search_social"
   */
  mappingLogicRef: string
}

export type ForecastBillingAgencyNormalized =
  | "advertising_associates"
  | "assembled_media"
  | "unknown"

/** Bucket used to route commission-style amounts into revenue forecast lines. */
export type ForecastRevenueCommissionBucket =
  | "search_social"
  | "direct_managed_digital"
  | "commission_other"
