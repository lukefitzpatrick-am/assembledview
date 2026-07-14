/**
 * Phase 2 campaign financials — shared input/output types.
 *
 * FeeLoading mirrors Xano `clients` fee columns as loaded into the media-plan
 * editor (see edit-page `Client` + `applyClientFees` / `refreshClientFeesFromApi`,
 * and Ava `FEE_KEYS` in `lib/ava/tools/summaries.ts`). Values are agency fee
 * percentages in [0, 100]. `getClientInfo` only surfaces `feesearch`; full fee
 * loading uses the clients collection record.
 */

import type { BillingMonth } from "@/lib/billing/types"

/** Canonical fee columns on a clients record (per media type). */
export type ClientFeeField =
  | "feetelevision"
  | "feeradio"
  | "feenewspapers"
  | "feemagazines"
  | "feeooh"
  | "feecinema"
  | "feedigidisplay"
  | "feedigiaudio"
  | "feedigivideo"
  | "feebvod"
  | "feeintegration"
  | "feesearch"
  | "feesocial"
  | "feeprogdisplay"
  | "feeprogvideo"
  | "feeprogbvod"
  | "feeprogaudio"
  | "feeprogooh"
  | "feecontentcreator"
  | "feeinfluencers"

/**
 * Client per-media-type fee rates (%). Partial — only media types the client
 * record populates are present (matches optional fields on the editor `Client`).
 */
export type FeeLoading = Partial<Record<ClientFeeField, number>>

/** Single month allocation (billing override months + per-line schedules). */
export type MonthAmount = {
  month: string
  amount: number
}

/**
 * Planning burst prior to schedule materialisation.
 * Dates drive prorate; budget is the entered media/burst amount before fee split.
 */
export type BurstInput = {
  startDate: string | Date
  endDate: string | Date
  /** Entered burst budget (gross or nett depending on line `budgetIncludesFees`). */
  budget?: number | string
  buyAmount?: number | string
  deliverables?: number
  calculatedValue?: number
  adServingRatePct?: number
  adServingImpressions?: number
}

export type BillingOverrideReason = "prepayment" | "client_terms" | "manual"

export type BillingOverride = {
  mode: "auto" | "manual"
  reason?: BillingOverrideReason
  months: MonthAmount[]
  /** Hash of the burst/campaign dates the override was set against. */
  dateBasis: string
}

/**
 * Per-line fee timing/amount override (billing fee component only).
 * Independent of {@link BillingOverride} which remains media-only.
 * When stored in `billing_overrides`, rows are distinguished by component `'fee'`.
 */
export type FeeOverride = {
  mode: "manual"
  reason?: BillingOverrideReason
  months: MonthAmount[]
  /** Hash of the burst/campaign dates the override was set against. */
  dateBasis: string
  /** Optional tag for shared-table rows; always the fee component. */
  component?: "fee"
}

export type LineItemApproval = "approved" | "excluded"

export type LineItemInput = {
  lineItemId: string
  mediaType: string
  buyType: string
  rate: number
  enteredAmount: number
  budgetIncludesFees: boolean
  clientPaysForMedia: boolean
  /**
   * Resolved agency fee % for this media type.
   * Optional on input — `computeCampaignFinancials` fills from `FeeLoading` by mediaType when unset.
   */
  feePct?: number
  deliverablesManual?: number
  bursts: BurstInput[]
  approval: LineItemApproval
  /** Media billing timing/amount override (does not affect fee). */
  billingOverride?: BillingOverride
  /** Fee billing timing/amount override (does not affect media). */
  feeOverride?: FeeOverride
}

export type PerLineResultFlags = {
  clientPaysForMedia: boolean
  manualBilling: boolean
  /** True when the line carries a manual fee override (timing and/or amount). */
  manualFee: boolean
  excluded: boolean
}

export type PerLineResult = {
  lineItemId: string
  /** Schedule / billing media key (e.g. `search`, `progDisplay`). */
  mediaType: string
  media: number
  fee: number
  nett: number
  deliverables: number
  deliveryMonths: MonthAmount[]
  billingMonths: MonthAmount[]
  flags: PerLineResultFlags
}

export type MbaScopeTotals = {
  grossMedia: number
  fee: number
  adServing: number
  production: number
  nettExGst: number
  nettIncGst: number
}

export type DeliveryVsBillingDelta = {
  month: string
  media: number
  reasons: string[]
}

export type CampaignFinancialsValidation = {
  billableEqualsMba: boolean
  deltaExGst: number
}

/**
 * Campaign-level delivery/billing schedules reuse {@link BillingMonth}
 * (same shape as `computeBillingAndDeliveryMonths` / editor schedules).
 */
export type CampaignFinancials = {
  perLine: PerLineResult[]
  deliverySchedule: BillingMonth[]
  billingSchedule: BillingMonth[]
  mbaScopeTotals: MbaScopeTotals
  deliveryVsBillingDelta: DeliveryVsBillingDelta[]
  validation: CampaignFinancialsValidation
  /**
   * True when any fee override changes the MBA fee total vs calculated
   * (amount delta). Timing-only overrides that preserve the sum leave this false.
   */
  mbaFeeAdjusted: boolean
  /**
   * True when {@link mbaFeeAdjusted} — signals that receivables/billing must
   * refresh. Compensating control for fee (see version spawn on approved MBAs).
   */
  rebill_needed: boolean
}
