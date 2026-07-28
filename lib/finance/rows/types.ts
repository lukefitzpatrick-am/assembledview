/**
 * Plan C S2 — flattened billing / delivery row shapes (1:1 with Xano tables).
 * See XANO-STAGE2-SCHEMA.md. Tables may be absent until Luke creates them;
 * app code must tolerate 404 / missing endpoints (flags off).
 */

/** `line_source` on plan_billing_rows / plan_delivery_rows. */
export type PlanRowLineSource = "channel" | "production" | "adserving" | "fee"

/** Provenance of a billing row amount. */
export type PlanBillingRowSource = "auto" | "manual" | "balancing"

/**
 * Xano `plan_billing_rows` — one billable slice per (version, line_uid, month).
 * UNIQUE (media_plan_version, line_uid, month).
 */
export type PlanBillingRow = {
  id?: number
  media_plan_version: number
  mba_number: string
  line_uid: string
  line_source: PlanRowLineSource
  media_type: string
  /** Calendar month `YYYY-MM`. */
  month: string
  media_amount: number
  fee_amount: number
  adserving_amount: number
  billable_amount: number
  client_pays_for_media: boolean
  is_manual_override: boolean
  source: PlanBillingRowSource
  override_id: number | null
  created_at?: string | number
}

/**
 * Xano `plan_delivery_rows` — delivery slice per (version, line_uid, month).
 * UNIQUE (media_plan_version, line_uid, month).
 */
export type PlanDeliveryRow = {
  id?: number
  media_plan_version: number
  mba_number: string
  line_uid: string
  line_source: PlanRowLineSource
  media_type: string
  /** Calendar month `YYYY-MM`. */
  month: string
  delivery_amount: number
  media_amount_full: number
  created_at?: string | number
}
