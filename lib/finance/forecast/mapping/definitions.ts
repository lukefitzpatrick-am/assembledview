/**
 * Finance Forecast — central mapping / config layer
 * ===================================================
 *
 * All assumptions about *which* CRM/Xano fields feed *which* forecast row should be
 * discoverable from this folder. Calculators (`buildFinanceForecastDataset`) should
 * delegate classification and field naming to exports here rather than re-encode rules.
 *
 * Reusable by: Finance Forecast UI, future snapshot persistence, variance views
 * (compare two datasets using the same `line_key` + mapping metadata).
 *
 * Do not add client-name or agency-specific (e.g. BIC) branching here — use data fields only.
 */

import type {
  FinanceForecastGroupKey,
  FinanceForecastLineKey,
} from "@/lib/types/financeForecast"
import {
  FINANCE_FORECAST_GROUP_KEYS,
  FINANCE_FORECAST_LINE_KEYS,
  FINANCE_FORECAST_LINE_LABELS,
} from "@/lib/types/financeForecast"
import type {
  ForecastLineMappingDefinition,
  ForecastRowDefinition,
  ForecastSourceFieldRef,
} from "./types"

// ---------------------------------------------------------------------------
// Normalised literals (compare with String(value).trim().toLowerCase())
// ---------------------------------------------------------------------------

/** `publishers.billingagency` when the publisher bills via Advertising Associates. */
export const PUBLISHER_BILLING_AGENCY_ADVERTISING_ASSOCIATES = "advertising associates"

/** `publishers.billingagency` when the publisher bills via Assembled Media (default agency). */
export const PUBLISHER_BILLING_AGENCY_ASSEMBLED_MEDIA = "assembled media"

/** `publishers.publishertype` — direct-sold / managed digital suppliers. */
export const PUBLISHER_TYPE_DIRECT = "direct"

/** `publishers.publishertype` — programmatic / internal biddable. */
export const PUBLISHER_TYPE_INTERNAL_BIDDABLE = "internal_biddable"

/**
 * When a schedule line cannot be matched to a publisher row, we still need a billing-agency
 * default for AA vs AM split. **Product decision:** unknown → assembled media billing bucket.
 * Change only here if finance approves a different default.
 */
export const DEFAULT_UNKNOWN_PUBLISHER_BILLING_AGENCY = PUBLISHER_BILLING_AGENCY_ASSEMBLED_MEDIA

// ---------------------------------------------------------------------------
// Media-type sets (internal keys from `getMediaTypeKeyFromDisplayName`)
// ---------------------------------------------------------------------------

/** Search + social commission bucket (`search_social_20pct` forecast line). */
export const FORECAST_SEARCH_SOCIAL_MEDIA_TYPE_KEYS = ["search", "socialMedia"] as const

/** Direct-managed digital commission bucket (`direct_managed_digital_40pct` forecast line). */
export const FORECAST_DIRECT_MANAGED_DIGITAL_MEDIA_TYPE_KEYS = [
  "digitalDisplay",
  "digitalAudio",
  "digitalVideo",
  "bvod",
  "integration",
] as const

// ---------------------------------------------------------------------------
// Publisher commission: mediaTypeKey → Xano column (canonical + legacy pub_*)
// Mirrors `lib/publisher/normalizePublisher.ts` comms pairs.
// ---------------------------------------------------------------------------

export type PublisherCommsFieldPair = { canonical: string; legacy: string }

export const FORECAST_MEDIA_TYPE_TO_PUBLISHER_COMMISSION_FIELDS: Readonly<
  Record<string, PublisherCommsFieldPair>
> = {
  television: { canonical: "television_comms", legacy: "pub_television_comms" },
  radio: { canonical: "radio_comms", legacy: "pub_radio_comms" },
  newspaper: { canonical: "newspaper_comms", legacy: "pub_newspaper_comms" },
  magazines: { canonical: "magazines_comms", legacy: "pub_magazines_comms" },
  ooh: { canonical: "ooh_comms", legacy: "pub_ooh_comms" },
  cinema: { canonical: "cinema_comms", legacy: "pub_cinema_comms" },
  digitalDisplay: { canonical: "digidisplay_comms", legacy: "pub_digidisplay_comms" },
  digitalAudio: { canonical: "digiaudio_comms", legacy: "pub_digiaudio_comms" },
  digitalVideo: { canonical: "digivideo_comms", legacy: "pub_digivideo_comms" },
  bvod: { canonical: "bvod_comms", legacy: "pub_bvod_comms" },
  integration: { canonical: "integration_comms", legacy: "pub_integration_comms" },
  search: { canonical: "search_comms", legacy: "pub_search_comms" },
  socialMedia: { canonical: "socialmedia_comms", legacy: "pub_socialmedia_comms" },
  progDisplay: { canonical: "progdisplay_comms", legacy: "pub_progdisplay_comms" },
  progVideo: { canonical: "progvideo_comms", legacy: "pub_progvideo_comms" },
  progBvod: { canonical: "progbvod_comms", legacy: "pub_progbvod_comms" },
  progAudio: { canonical: "progaudio_comms", legacy: "pub_progaudio_comms" },
  progOoh: { canonical: "progooh_comms", legacy: "pub_progooh_comms" },
  influencers: { canonical: "influencers_comms", legacy: "pub_influencers_comms" },
} as const

/**
 * How raw `*_comms` values are turned into a monetary commission amount.
 * **Rule:** value ≤ 1 → treated as decimal fraction (0.2 = 20%); value > 1 → whole percent (20 = 20%).
 * Confirm with finance if Xano ever stores basis points or another scale — adjust only here.
 */
export const FORECAST_COMMISSION_RATE_GREATER_THAN_ONE_IS_PERCENT = true

// ---------------------------------------------------------------------------
// Client record: fee / retainer fields (see `lib/validations/client.ts`)
// ---------------------------------------------------------------------------

export const CLIENT_FIELD_MONTHLY_RETAINER = "monthlyretainer"
export const CLIENT_FIELD_FEE_SEARCH = "feesearch"
export const CLIENT_FIELD_FEE_SOCIAL = "feesocial"
export const CLIENT_FIELD_FEE_PROG_DISPLAY = "feeprogdisplay"
export const CLIENT_FIELD_FEE_PROG_VIDEO = "feeprogvideo"
export const CLIENT_FIELD_FEE_PROG_BVOD = "feeprogbvod"
export const CLIENT_FIELD_FEE_PROG_AUDIO = "feeprogaudio"
export const CLIENT_FIELD_FEE_PROG_OOH = "feeprogooh"

/** Programmatic fee columns summed into the direct-managed-digital client-fee bucket. */
export const CLIENT_PROG_FEE_FIELDS = [
  CLIENT_FIELD_FEE_PROG_DISPLAY,
  CLIENT_FIELD_FEE_PROG_VIDEO,
  CLIENT_FIELD_FEE_PROG_BVOD,
  CLIENT_FIELD_FEE_PROG_AUDIO,
  CLIENT_FIELD_FEE_PROG_OOH,
] as const

// ---------------------------------------------------------------------------
// media_plan_versions + JSON schedules
// ---------------------------------------------------------------------------

export const VERSION_FIELD_BILLING_SCHEDULE = "billingSchedule"
export const VERSION_FIELD_BILLING_SCHEDULE_SNAKE = "billing_schedule"
export const VERSION_FIELD_DELIVERY_SCHEDULE = "deliverySchedule"
export const VERSION_FIELD_DELIVERY_SCHEDULE_SNAKE = "delivery_schedule"
export const VERSION_FIELD_EXTRA = "extra"

/**
 * Bursts used only as a **fallback** when billing + delivery schedules yield no amount.
 * Populated from `media_plan_versions.extra.bursts` when present (not a top-level Xano column today).
 */
export const VERSION_EXTRA_BURSTS_KEY = "bursts"

// ---------------------------------------------------------------------------
// Per-line documentation (forecast + variance + snapshot metadata)
// ---------------------------------------------------------------------------

const sf = (
  entity: ForecastSourceFieldRef["entity"],
  fields: string[],
  role: string
): ForecastSourceFieldRef => ({ entity, fields: fields as readonly string[], role })

const ROW_DEFINITIONS: readonly ForecastRowDefinition[] = [
  {
    key: FINANCE_FORECAST_LINE_KEYS.advertisingAssociatesBillingForPublisher,
    label: FINANCE_FORECAST_LINE_LABELS[FINANCE_FORECAST_LINE_KEYS.advertisingAssociatesBillingForPublisher],
    group: FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation,
    sortOrder: 10,
    mappingLogicRef: "buildLinesForCampaign#billing_schedule_aa_publisher_media",
    line_key: FINANCE_FORECAST_LINE_KEYS.advertisingAssociatesBillingForPublisher,
    summary: "AA billing (publisher media)",
    businessRule:
      "Sum of agency-billable media amounts from the primary schedule month (billing preferred, then delivery) where the matched publisher’s `billingagency` is Advertising Associates.",
    sourceFields: [
      sf("billing_schedule_json", ["mediaTypes[].lineItems[].amount", "header1", "lineItemId"], "media $ by line"),
      sf("publishers", ["billingagency", "publisher_name"], "route line to AA vs AM"),
      sf("media_plan_versions", [VERSION_FIELD_BILLING_SCHEDULE, VERSION_FIELD_DELIVERY_SCHEDULE], "schedule JSON"),
    ],
  },
  {
    key: FINANCE_FORECAST_LINE_KEYS.assembledMediaBillingForPublisher,
    label: FINANCE_FORECAST_LINE_LABELS[FINANCE_FORECAST_LINE_KEYS.assembledMediaBillingForPublisher],
    group: FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation,
    sortOrder: 20,
    mappingLogicRef: "buildLinesForCampaign#billing_schedule_am_publisher_media",
    line_key: FINANCE_FORECAST_LINE_KEYS.assembledMediaBillingForPublisher,
    summary: "Assembled Media billing (publisher media)",
    businessRule:
      "Same as AA line, but includes publishers with `billingagency` Assembled Media and any unmatched publisher rows (see DEFAULT_UNKNOWN_PUBLISHER_BILLING_AGENCY).",
    sourceFields: [
      sf("billing_schedule_json", ["mediaTypes[].lineItems[].amount"], "media $ by line"),
      sf("publishers", ["billingagency"], "AA vs AM split"),
      sf("media_plan_versions", [VERSION_FIELD_BILLING_SCHEDULE, VERSION_FIELD_DELIVERY_SCHEDULE], "schedule JSON"),
    ],
  },
  {
    key: FINANCE_FORECAST_LINE_KEYS.searchSocial20Pct,
    label: FINANCE_FORECAST_LINE_LABELS[FINANCE_FORECAST_LINE_KEYS.searchSocial20Pct],
    group: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
    sortOrder: 10,
    mappingLogicRef: "buildLinesForCampaign#publisher_comms_search_social + buildClientLevelRevenueLines#client_feesearch_feesocial",
    line_key: FINANCE_FORECAST_LINE_KEYS.searchSocial20Pct,
    summary: "Search & social commission / fees",
    businessRule:
      "Commission: billing line items classified as Search or Social Media × publisher `search_comms` / `socialmedia_comms` (and legacy `pub_*` aliases). **Fixed client fees:** `clients.feesearch` + `clients.feesocial` (monthly) rolled in at client level. UI label “20%” is not hardcoded — rates come from data.",
    sourceFields: [
      sf("publishers", ["search_comms", "socialmedia_comms", "pub_search_comms", "pub_socialmedia_comms"], "commission %"),
      sf("clients", [CLIENT_FIELD_FEE_SEARCH, CLIENT_FIELD_FEE_SOCIAL], "optional fixed monthly fees"),
      sf("billing_schedule_json", ["mediaTypes[].mediaType", "lineItems[]"], "classify channel"),
    ],
  },
  {
    key: FINANCE_FORECAST_LINE_KEYS.directManagedDigital40Pct,
    label: FINANCE_FORECAST_LINE_LABELS[FINANCE_FORECAST_LINE_KEYS.directManagedDigital40Pct],
    group: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
    sortOrder: 20,
    mappingLogicRef: "buildLinesForCampaign#publisher_comms_direct_digital + buildClientLevelRevenueLines#client_feeprog_sum",
    line_key: FINANCE_FORECAST_LINE_KEYS.directManagedDigital40Pct,
    summary: "Direct managed digital commission / fees",
    businessRule:
      "Commission: digital display/audio/video/bvod/integration line items where `publishertype` is `direct`, multiplied by per-channel `*_comms` on the publisher. **Client feeprog*:** sum of `feeprogdisplay`, `feeprogvideo`, `feeprogbvod`, `feeprogaudio`, `feeprogooh` as monthly amounts. UI label “40%” is not hardcoded.",
    sourceFields: [
      sf("publishers", ["publishertype", "digidisplay_comms", "digiaudio_comms", "digivideo_comms", "bvod_comms", "integration_comms"], "rate + direct flag"),
      sf("clients", [...CLIENT_PROG_FEE_FIELDS], "optional fixed monthly prog fees"),
      sf("billing_schedule_json", ["mediaTypes[].mediaType", "lineItems[]"], "classify digital lines"),
    ],
  },
  {
    key: FINANCE_FORECAST_LINE_KEYS.commission,
    label: FINANCE_FORECAST_LINE_LABELS[FINANCE_FORECAST_LINE_KEYS.commission],
    group: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
    sortOrder: 30,
    mappingLogicRef: "buildLinesForCampaign#publisher_comms_other_channels",
    line_key: FINANCE_FORECAST_LINE_KEYS.commission,
    summary: "Commission (remaining channels)",
    businessRule:
      "Publisher commission on line items **not** routed to search/social or direct-managed-digital buckets, using `FORECAST_MEDIA_TYPE_TO_PUBLISHER_COMMISSION_FIELDS` for the resolved media type key.",
    sourceFields: [
      sf("publishers", Object.values(FORECAST_MEDIA_TYPE_TO_PUBLISHER_COMMISSION_FIELDS).flatMap((p) => [p.canonical, p.legacy]), "per-channel comms"),
      sf("billing_schedule_json", ["mediaTypes[].lineItems[]"], "amounts + media type"),
    ],
  },
  {
    key: FINANCE_FORECAST_LINE_KEYS.serviceFeeDigital,
    label: FINANCE_FORECAST_LINE_LABELS[FINANCE_FORECAST_LINE_KEYS.serviceFeeDigital],
    group: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
    sortOrder: 40,
    mappingLogicRef: "buildLinesForCampaign#billing_schedule_service_fees",
    line_key: FINANCE_FORECAST_LINE_KEYS.serviceFeeDigital,
    summary: "Service fee (assembled + ad serving)",
    businessRule:
      "Per calendar month: `assembledFee` + `adservingTechFees` from `extractServiceAmountsFromBillingSchedule` in `lib/finance/utils.ts` (billing JSON month entry), with delivery schedule fallback when billing month has no service fields.",
    sourceFields: [
      sf("billing_schedule_json", ["feeTotal", "fee_total", "assembledFee", "adservingTechFees", "adserving_tech_fees"], "month-level service amounts"),
      sf("media_plan_versions", [VERSION_FIELD_BILLING_SCHEDULE, VERSION_FIELD_DELIVERY_SCHEDULE], "JSON source"),
    ],
  },
  {
    key: FINANCE_FORECAST_LINE_KEYS.fixedPriceGtd,
    label: FINANCE_FORECAST_LINE_LABELS[FINANCE_FORECAST_LINE_KEYS.fixedPriceGtd],
    group: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
    sortOrder: 50,
    mappingLogicRef: "buildLinesForCampaign#billing_schedule_production",
    line_key: FINANCE_FORECAST_LINE_KEYS.fixedPriceGtd,
    summary: "Fixed price / GTD (production bucket)",
    businessRule:
      "Per calendar month: `production` component from the same `extractServiceAmountsFromBillingSchedule` helper (mapped to fixed/GTD until a dedicated GTD field exists on versions).",
    sourceFields: [
      sf("billing_schedule_json", ["production", "production_cost", "productionCost"], "month-level production $"),
      sf("media_plan_versions", [VERSION_FIELD_BILLING_SCHEDULE, VERSION_FIELD_DELIVERY_SCHEDULE], "JSON source"),
    ],
    incomplete: true,
  },
  {
    key: FINANCE_FORECAST_LINE_KEYS.retainer,
    label: FINANCE_FORECAST_LINE_LABELS[FINANCE_FORECAST_LINE_KEYS.retainer],
    group: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
    sortOrder: 60,
    mappingLogicRef: "buildClientLevelRevenueLines#client_monthlyretainer",
    line_key: FINANCE_FORECAST_LINE_KEYS.retainer,
    summary: "Retainer",
    businessRule:
      "Client-level `monthlyretainer` applied evenly across each month of the selected financial year (not stored on `media_plan_versions`).",
    sourceFields: [sf("clients", [CLIENT_FIELD_MONTHLY_RETAINER], "monthly $")],
  },
  {
    key: FINANCE_FORECAST_LINE_KEYS.projectScopePrip,
    label: FINANCE_FORECAST_LINE_LABELS[FINANCE_FORECAST_LINE_KEYS.projectScopePrip],
    group: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
    sortOrder: 70,
    mappingLogicRef: "buildClientLevelRevenueLines#project_scope_prip_placeholder",
    line_key: FINANCE_FORECAST_LINE_KEYS.projectScopePrip,
    summary: "Project / scope / PRIP",
    businessRule:
      "**TODO — schema:** No dedicated PRIP / project fee column is defined on `FinanceForecastMediaPlanVersionInput` or client typings used by this app. Placeholder row (zeros) until product specifies Xano fields and allocation rules.",
    sourceFields: [],
    incomplete: true,
  },
  {
    key: FINANCE_FORECAST_LINE_KEYS.totalRevenue,
    label: FINANCE_FORECAST_LINE_LABELS[FINANCE_FORECAST_LINE_KEYS.totalRevenue],
    group: FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission,
    sortOrder: 999,
    mappingLogicRef: "attachTotalRevenueLine#sum_revenue_body_lines",
    line_key: FINANCE_FORECAST_LINE_KEYS.totalRevenue,
    summary: "Total revenue",
    businessRule:
      "Sum of all `FORECAST_REVENUE_BODY_LINE_ORDER` rows for the client (after aggregation in the calculator).",
    sourceFields: [],
  },
]

function orderedKeysByGroup(group: FinanceForecastGroupKey): readonly FinanceForecastLineKey[] {
  return ROW_DEFINITIONS
    .filter((d) => d.group === group)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((d) => d.key)
}

/**
 * Ordered keys: billing block display order.
 * Derived from `ROW_DEFINITIONS` so adding rows is config-only.
 */
export const FORECAST_BILLING_LINE_ORDER: readonly FinanceForecastLineKey[] = orderedKeysByGroup(
  FINANCE_FORECAST_GROUP_KEYS.billingBasedInformation
)

/**
 * Revenue body lines (excluding `total_revenue`), in display / rollup order.
 * Derived from `ROW_DEFINITIONS`.
 */
export const FORECAST_REVENUE_BODY_LINE_ORDER: readonly FinanceForecastLineKey[] = orderedKeysByGroup(
  FINANCE_FORECAST_GROUP_KEYS.revenueFeesCommission
).filter((k) => k !== FINANCE_FORECAST_LINE_KEYS.totalRevenue)

const DEFINITIONS_LIST: readonly ForecastLineMappingDefinition[] = ROW_DEFINITIONS.map((d) => ({
  line_key: d.key,
  summary: d.summary,
  businessRule: d.businessRule,
  sourceFields: d.sourceFields,
  incomplete: d.incomplete,
}))

const DEFINITIONS_BY_KEY: ReadonlyMap<FinanceForecastLineKey, ForecastLineMappingDefinition> = new Map(
  DEFINITIONS_LIST.map((d) => [d.line_key, d])
)

export function getForecastLineMappingDefinition(
  lineKey: FinanceForecastLineKey
): ForecastLineMappingDefinition | undefined {
  return DEFINITIONS_BY_KEY.get(lineKey)
}

export function listForecastLineMappingDefinitions(): readonly ForecastLineMappingDefinition[] {
  return DEFINITIONS_LIST
}

export function listForecastRowDefinitions(): readonly ForecastRowDefinition[] {
  return ROW_DEFINITIONS
}

export function getForecastRowDefinition(lineKey: FinanceForecastLineKey): ForecastRowDefinition | undefined {
  return ROW_DEFINITIONS.find((d) => d.key === lineKey)
}

// ---------------------------------------------------------------------------
// Central schema / product gaps (complete here before touching calculators)
// ---------------------------------------------------------------------------

export const FORECAST_MAPPING_SCHEMA_GAPS = {
  /**
   * **project_scope_prip:** Need authoritative Xano fields (version-level vs client-level vs SOW table)
   * and whether amounts are monthly, FY lump sum, or tied to MBA milestones.
   */
  projectScopePrip: "PENDING_FIELD_SPEC_FROM_PRODUCT_AND_XANO",

  /**
   * **fixed_price_gtd:** Currently uses billing JSON `production` only. If GTD is distinct from production,
   * add field names and mapping here first.
   */
  fixedPriceGtdVsProduction: "PENDING_CONFIRM_PRODUCTION_IS_PROXY_FOR_GTD",

  /**
   * **service_fee_digital:** Includes all assembled + ad-serving fees from month entry, not filtered to
   * “digital” only. If finance needs digital-only split, define rule + fields here.
   */
  serviceFeeDigitalScope: "PENDING_DIGITAL_ONLY_FILTER_IF_REQUIRED",

  /**
   * **bursts:** Read from `media_plan_versions.extra.bursts` only. If bursts move to a top-level column,
   * add the field name here and update the calculator’s burst reader.
   */
  burstsLocation: "USES_EXTRA_BURSTS_KEY_UNTIL_XANO_DOCUMENTS_OFFICIAL_PATH",
} as const
