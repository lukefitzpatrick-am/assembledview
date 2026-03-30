/**
 * Finance Forecast mapping layer — import from here for UI, snapshots, and variance.
 *
 * - `definitions.ts` — field sources, business rules, schema gap checklist.
 * - `classification.ts` — pure routing (billing entity, commission bucket, rates).
 * - `types.ts` — shared mapping TypeScript types.
 */

export type {
  ForecastBillingAgencyNormalized,
  ForecastLineMappingDefinition,
  ForecastMappingEntity,
  ForecastRowDefinition,
  ForecastRevenueCommissionBucket,
  ForecastSourceFieldRef,
} from "./types"

export {
  CLIENT_FIELD_FEE_PROG_AUDIO,
  CLIENT_FIELD_FEE_PROG_BVOD,
  CLIENT_FIELD_FEE_PROG_DISPLAY,
  CLIENT_FIELD_FEE_PROG_OOH,
  CLIENT_FIELD_FEE_PROG_VIDEO,
  CLIENT_FIELD_FEE_SEARCH,
  CLIENT_FIELD_FEE_SOCIAL,
  CLIENT_FIELD_MONTHLY_RETAINER,
  CLIENT_PROG_FEE_FIELDS,
  DEFAULT_UNKNOWN_PUBLISHER_BILLING_AGENCY,
  FORECAST_BILLING_LINE_ORDER,
  FORECAST_COMMISSION_RATE_GREATER_THAN_ONE_IS_PERCENT,
  FORECAST_DIRECT_MANAGED_DIGITAL_MEDIA_TYPE_KEYS,
  FORECAST_MAPPING_SCHEMA_GAPS,
  FORECAST_MEDIA_TYPE_TO_PUBLISHER_COMMISSION_FIELDS,
  FORECAST_REVENUE_BODY_LINE_ORDER,
  FORECAST_SEARCH_SOCIAL_MEDIA_TYPE_KEYS,
  getForecastLineMappingDefinition,
  getForecastRowDefinition,
  listForecastLineMappingDefinitions,
  listForecastRowDefinitions,
  PUBLISHER_BILLING_AGENCY_ADVERTISING_ASSOCIATES,
  PUBLISHER_BILLING_AGENCY_ASSEMBLED_MEDIA,
  PUBLISHER_TYPE_DIRECT,
  PUBLISHER_TYPE_INTERNAL_BIDDABLE,
  VERSION_EXTRA_BURSTS_KEY,
  VERSION_FIELD_BILLING_SCHEDULE,
  VERSION_FIELD_BILLING_SCHEDULE_SNAKE,
  VERSION_FIELD_DELIVERY_SCHEDULE,
  VERSION_FIELD_DELIVERY_SCHEDULE_SNAKE,
  VERSION_FIELD_EXTRA,
} from "./definitions"

export {
  applyForecastCommissionRate,
  normalizePublisherBillingAgency,
  readPublisherCommissionRate,
  resolveRevenueCommissionBucket,
  splitBillableAmountByBillingEntity,
} from "./classification"
