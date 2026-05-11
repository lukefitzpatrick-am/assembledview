/**
 * Pacing API types: Xano mirror tables + Snowflake mart rows + request/response envelopes.
 * Field names use snake_case to match Xano / REST conventions.
 */

export type PacingStatus =
  | "not_started"
  | "on_track"
  | "slightly_under"
  | "under_pacing"
  | "slightly_over"
  | "over_pacing"
  | "no_delivery"
  | "completed"

export type PacingSeverity = "info" | "warning" | "critical"

export type PacingDeliveryHealth = "spending" | "no_delivery" | "no_recent_delivery" | "paused_yesterday"

export type PacingGroupType = "campaign" | "ad_group" | "asset_group" | "ad_set" | "line_item"

export type PacingMatchType = "exact" | "prefix" | "regex" | "suffix_id"

/** Xano `pacing_mappings.created_via` — how the row was created */
export type PacingCreatedVia = "manual" | "search_sync"

/** Xano table `pacing_mappings` */
export type PacingMapping = {
  id: number
  clients_id: number
  media_plan_id: number | null
  av_line_item_id: string
  av_line_item_label: string | null
  media_type: string | null
  platform: string | null
  match_type: PacingMatchType
  campaign_name_pattern: string | null
  group_name_pattern: string | null
  /**
   * Suffix after last "-" in ad group / asset group name (`media_plan_search.line_item_id` for auto search rows).
   * Required when `match_type` is `suffix_id` (ignored for other match types).
   */
  av_line_item_code?: string | null
  budget_split_pct: number
  line_item_budget: number | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
  /** UI / sync origin; null if column missing (legacy rows) */
  created_via?: PacingCreatedVia | null
  created_at: number | string | null
  updated_at: number | string | null
  created_by_users_id: number | null
}

/** When `match_type` is `suffix_id`, set `av_line_item_code`; campaign/group patterns are ignored. */
export type PacingMappingInput = Partial<Omit<PacingMapping, "id">> &
  Pick<PacingMapping, "clients_id" | "av_line_item_id">

/** Xano table `pacing_thresholds` */
export type PacingThreshold = {
  id: number
  clients_id: number
  on_track_pct: number
  slightly_threshold_pct: number
  no_delivery_days: number
  updated_at: number | string | null
}

export type PacingThresholdUpsertInput = {
  clients_id: number
  on_track_pct?: number
  slightly_threshold_pct?: number
  no_delivery_days?: number
}

export type PacingAlertSubscription = {
  id: number
  users_id: number
  clients_ids: number[]
  media_types: string[]
  min_severity: Exclude<PacingSeverity, "info"> | PacingSeverity
  send_time_local: string | null
  timezone: string
  channel: string
  send_when_no_alerts: boolean
  is_active: boolean
}

export type PacingAlertSubscriptionInput = Omit<
  Partial<PacingAlertSubscription>,
  "id"
>

export type PacingAlertLog = {
  id: number
  subscription_id: number
  users_id: number
  sent_at: number | string | null
  alert_count: number
  status: string
  error_message: string | null
}

/** Snowflake ASSEMBLEDVIEW.VW_PACING.V_LINE_ITEM_PACING — API-normalized row */
export type LineItemPacingRow = {
  clients_id: number
  media_plan_id: number | null
  av_line_item_id: string
  av_line_item_label: string | null
  mba_number: string | null
  campaign_name: string | null
  media_type: string | null
  platform: string | null
  pacing_status: PacingStatus | string
  delivery_health: PacingDeliveryHealth | string | null
  budget_amount: number | null
  spend_amount: number | null
  pacing_ratio: number | null
  expected_spend: number | null
  start_date: string | null
  end_date: string | null
  /** Include dynamic view columns as passthrough */
  [key: string]: unknown
}

export type LineItemPacingDailyPoint = {
  delivery_date: string
  av_line_item_id: string
  spend: number | null
  impressions: number | null
  clicks: number | null
  conversions: number | null
  [key: string]: unknown
}

export type DeliveryPacingRow = {
  av_line_item_id: string
  platform: string | null
  group_type: PacingGroupType | string | null
  campaign_name: string | null
  group_name: string | null
  delivery_date: string | null
  spend: number | null
  impressions?: number | null
  clicks?: number | null
  conversions?: number | null
  ctr?: number | null
  cpc?: number | null
  cpa?: number | null
  roas?: number | null
  target_cpa?: number | null
  target_roas?: number | null
  delivery_health?: string | null
  reach?: number | null
  frequency?: number | null
  viewable_impressions?: number | null
  viewability?: number | null
  completed_views?: number | null
  vcr?: number | null
  delivery_pct?: number | null
  [key: string]: unknown
}

export type PacingAlert = {
  clients_id: number
  severity: PacingSeverity | string
  media_type: string | null
  av_line_item_id: string | null
  alert_message: string | null
  alert_code: string | null
  pacing_status?: string | null
  [key: string]: unknown
}

export type PacingTestMatchRequest = {
  platform: string
  match_type: PacingMatchType
  campaign_name_pattern: string | null
  group_name_pattern: string | null
  /** Required when match_type is suffix_id */
  av_line_item_code?: string | null
  start_date: string
  end_date: string
}

export type PacingTestMatchRow = {
  campaign_name: string | null
  group_name: string | null
  group_type: string | null
}

/** POST `/api/pacing/mappings/test-match` — `data` envelope */
export type PacingTestMatchResponse = {
  match_count: number
  matches: PacingTestMatchRow[]
}

/** Rows from `/api/pacing/search-mappings-no-recent-delivery` */
export type SearchMappingNoRecentDeliveryRow = {
  av_line_item_id: string | null
  av_line_item_label: string | null
  av_line_item_code: string | null
}

export type PacingListResponse<T> = {
  data: T[]
}

export type PacingItemResponse<T> = {
  data: T
}
