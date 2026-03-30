/**
 * Shared type layer for the Finance Forecast view.
 * Describes shapes for UI, transforms, and variance — not API transport or fetch behaviour.
 */

// ---------------------------------------------------------------------------
// Fiscal year month order (July → June, Australian FY convention)
// ---------------------------------------------------------------------------

/** Twelve fiscal slots in display order: month 1 = July through month 12 = June. */
export const FINANCE_FORECAST_FISCAL_MONTH_ORDER = [
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
] as const

export type FinanceForecastMonthKey = (typeof FINANCE_FORECAST_FISCAL_MONTH_ORDER)[number]

/** Canonical map type for one financial year of monthly amounts (all twelve slots). */
export type FinanceForecastMonthlyAmounts = Record<FinanceForecastMonthKey, number>

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export type FinanceForecastScenario = "confirmed" | "confirmed_plus_probable"

// ---------------------------------------------------------------------------
// Row groups (billing vs revenue / fees / commission)
// ---------------------------------------------------------------------------

export const FINANCE_FORECAST_GROUP_KEYS = {
  billingBasedInformation: "billing_based_information",
  revenueFeesCommission: "revenue_client_publisher_fees_commission",
} as const

export type FinanceForecastGroupKey =
  (typeof FINANCE_FORECAST_GROUP_KEYS)[keyof typeof FINANCE_FORECAST_GROUP_KEYS]

export const FINANCE_FORECAST_GROUP_LABELS: Record<FinanceForecastGroupKey, string> = {
  [FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation]: "Billing based information",
  [FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission]:
    "Revenue based on client and publisher fees and commission",
}

// ---------------------------------------------------------------------------
// Line keys (stable identifiers for forecast rows)
// ---------------------------------------------------------------------------

export const FINANCE_FORECAST_LINE_KEYS = {
  advertisingAssociatesBillingForPublisher: "advertising_associates_billing_for_publisher",
  assembledMediaBillingForPublisher: "assembled_media_billing_for_publisher",
  searchSocial20Pct: "search_social_20pct",
  directManagedDigital40Pct: "direct_managed_digital_40pct",
  commission: "commission",
  serviceFeeDigital: "service_fee_digital",
  fixedPriceGtd: "fixed_price_gtd",
  retainer: "retainer",
  projectScopePrip: "project_scope_prip",
  totalRevenue: "total_revenue",
} as const

export type FinanceForecastLineKey =
  (typeof FINANCE_FORECAST_LINE_KEYS)[keyof typeof FINANCE_FORECAST_LINE_KEYS]

export const FINANCE_FORECAST_LINE_LABELS: Record<FinanceForecastLineKey, string> = {
  [FINANCE_FORECAST_LINE_KEYS.advertisingAssociatesBillingForPublisher]:
    "Advertising Associates as billing for publisher",
  [FINANCE_FORECAST_LINE_KEYS.assembledMediaBillingForPublisher]:
    "Assembled Media as billing for publisher",
  [FINANCE_FORECAST_LINE_KEYS.searchSocial20Pct]: "Search & Social — 20%",
  [FINANCE_FORECAST_LINE_KEYS.directManagedDigital40Pct]: "Direct managed digital — 40%",
  [FINANCE_FORECAST_LINE_KEYS.commission]: "Commission",
  [FINANCE_FORECAST_LINE_KEYS.serviceFeeDigital]: "Service fee (digital)",
  [FINANCE_FORECAST_LINE_KEYS.fixedPriceGtd]: "Fixed price GTD",
  [FINANCE_FORECAST_LINE_KEYS.retainer]: "Retainer",
  [FINANCE_FORECAST_LINE_KEYS.projectScopePrip]: "Project / scope / PRIP",
  [FINANCE_FORECAST_LINE_KEYS.totalRevenue]: "Total revenue",
}

// ---------------------------------------------------------------------------
// Source & debug metadata on lines
// ---------------------------------------------------------------------------

/**
 * Provenance for a forecast line — transform pipelines can fill this without
 * implying a specific HTTP API or Xano verb.
 */
export interface FinanceForecastLineSource {
  /** High-level origin (e.g. billing_schedule_row, fee_rule, manual_adjustment). */
  kind: string
  /** Primary media plan version record identifier when the line ties to a version row. */
  media_plan_version_id?: string | number | null
  /** Optional secondary pointers for traceability. */
  refs?: ReadonlyArray<{
    label?: string
    record_type?: string
    record_id?: string | number | null
    field?: string | null
  }>
}

/** Optional diagnostics attached to a line for QA or reconciliation screens. */
export interface FinanceForecastLineDebug {
  stage?: string
  /** Human-readable explanation of how the row was produced. */
  explanation?: string
  /** Optional opaque fingerprint of inputs (hash, version id, etc.). */
  inputs_digest?: string
}

// ---------------------------------------------------------------------------
// Core forecast rows
// ---------------------------------------------------------------------------

export interface FinanceForecastLine {
  client_id: string
  client_name: string
  /** Business campaign identifier when distinct from MBA. */
  campaign_id?: string | null
  /** Media plan / MBA identifier when available. */
  mba_number?: string | null
  media_plan_version_id: string | number | null
  version_number: number | null
  scenario: FinanceForecastScenario
  group_key: FinanceForecastGroupKey
  line_key: FinanceForecastLineKey
  monthly: FinanceForecastMonthlyAmounts
  fy_total: number
  source: FinanceForecastLineSource
  debug?: FinanceForecastLineDebug
}

/** A logical group of lines under one client (billing block vs revenue block). */
export interface FinanceForecastRowGroup {
  group_key: FinanceForecastGroupKey
  /** Display title; defaults can come from FINANCE_FORECAST_GROUP_LABELS. */
  title?: string
  lines: FinanceForecastLine[]
}

/** All row groups for one client within a dataset. */
export interface FinanceForecastClientBlock {
  client_id: string
  client_name: string
  groups: FinanceForecastRowGroup[]
}

// ---------------------------------------------------------------------------
// Dataset, filters, snapshot, variance
// ---------------------------------------------------------------------------

export interface FinanceForecastDatasetMeta {
  /** Calendar year in which the financial year starts (1 July). E.g. 2025 → FY labelled 2025–26 in copy. */
  financial_year_start_year: number
  scenario: FinanceForecastScenario
  /** ISO timestamp when the dataset was assembled (client clock or server). */
  generated_at?: string
  /** Optional semantic version for transform / schema compatibility. */
  schema_version?: string
}

export interface FinanceForecastDataset {
  meta: FinanceForecastDatasetMeta
  client_blocks: FinanceForecastClientBlock[]
}

export interface FinanceForecastFilters {
  scenario: FinanceForecastScenario
  financial_year_start_year: number
  client_ids?: ReadonlyArray<string>
  publisher_ids?: ReadonlyArray<string>
  /** When true, include campaigns treated as probable (interpretation left to transforms). */
  include_probable_campaigns?: boolean
}

/** Per-month and FY difference between two amounts (e.g. scenario A vs B or forecast vs actual). */
export interface FinanceForecastVarianceLine {
  client_id: string
  client_name: string
  campaign_id?: string | null
  mba_number?: string | null
  media_plan_version_id: string | number | null
  version_number: number | null
  group_key: FinanceForecastGroupKey
  line_key: FinanceForecastLineKey
  monthly_delta: FinanceForecastMonthlyAmounts
  fy_delta: number
  baseline_label?: string
  comparison_label?: string
  source?: FinanceForecastLineSource
  debug?: FinanceForecastLineDebug
}

// ---------------------------------------------------------------------------
// Raw inputs for transforms (tolerant shapes — no fetch or URL assumptions)
// ---------------------------------------------------------------------------

/**
 * Minimal superset of fields a transform might read from a `media_plan_versions`-like row.
 * All fields optional so pipelines can narrow what they need.
 */
export interface FinanceForecastMediaPlanVersionInput {
  id?: string | number | null
  mba_number?: string | null
  version_number?: number | string | null
  media_plan_master_id?: number | string | null
  mp_client_name?: string | null
  campaign_name?: string | null
  campaign_id?: string | number | null
  campaign_status?: string | null
  mp_campaignstatus?: string | null
  campaign_start_date?: string | null
  campaign_end_date?: string | null
  billingSchedule?: unknown
  billing_schedule?: unknown
  deliverySchedule?: unknown
  delivery_schedule?: unknown
  po_number?: string | null
  /** Allow additional columns without losing type safety at use sites. */
  extra?: Record<string, unknown>
}

/**
 * Client row shape commonly merged from client APIs — names and ids vary by source.
 */
export interface FinanceForecastClientInput {
  id?: string | number | null
  clientname_input?: string | null
  mp_client_name?: string | null
  name?: string | null
  slug?: string | null
  payment_days?: number | string | null
  payment_terms?: string | null
  extra?: Record<string, unknown>
}

/**
 * Publisher row subset used when attributing billing or fee splits.
 * Aligns conceptually with `Publisher` but stays optional-heavy for ingest.
 */
export interface FinanceForecastPublisherInput {
  id?: number | string | null
  publisherid?: string | null
  publisher_name?: string | null
  billingagency?: string | null
  publishertype?: string | null
  financecode?: string | null
  extra?: Record<string, unknown>
}

/** Bundle passed into a forecast builder (no behaviour). */
export interface FinanceForecastTransformInputs {
  media_plan_versions: ReadonlyArray<FinanceForecastMediaPlanVersionInput>
  clients: ReadonlyArray<FinanceForecastClientInput>
  publishers: ReadonlyArray<FinanceForecastPublisherInput>
}
