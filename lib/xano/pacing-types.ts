/**
 * Pacing API types: Snowflake mart rows + request/response envelopes.
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

export type PacingDeliveryHealth = "spending" | "no_delivery" | "no_recent_delivery" | "paused_yesterday"

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
