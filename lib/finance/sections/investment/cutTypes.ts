/**
 * Investment cut — request/response contract.
 * Cents everywhere. One basis per response. Cap + truncated flag.
 * Actuals (Xero) measures are MBA×month grain only — see cutGrain.ts.
 */

import type { ChannelGroup } from "./channelGroups"
import type { ActualsGrainViolation } from "./cutGrain"

export const INVESTMENT_CUT_DIMS = [
  "client",
  "channelGroup",
  "channel",
  "publisher",
  "buyType",
  "market",
  "month",
  "fy",
  "billingAgency",
] as const

export type InvestmentCutDim = (typeof INVESTMENT_CUT_DIMS)[number]

export const INVESTMENT_CUT_MEASURES = [
  "media_cents",
  "fee_cents",
  "adserving_cents",
  "billable_cents",
  "invoiced_cents",
  "paid_cents",
  "invoiced_delta_cents",
  /** Agency economics — forecast retainer mapping (client.monthlyretainer). */
  "retainer_cents",
  /** Agency economics — forecast SOW/PRIP placeholder (zeros until schema lands). */
  "sow_cents",
  /** fee (+ optional adserving) + retainer + sow. */
  "revenue_cents",
  /** revenue / billable × 100; omitted when billable is 0. */
  "margin_pct",
] as const

export type InvestmentCutMeasure = (typeof INVESTMENT_CUT_MEASURES)[number]

export type InvestmentCutBasis = "billing" | "delivery"

/** Hard row cap — never silently truncate without the flag. */
export const INVESTMENT_CUT_ROW_CAP = 5000

/** Publisher identity null/empty → this bucket (Investment contract; Costs uses Unspecified). */
export const UNMATCHED_PUBLISHER = "Unmatched"

export type InvestmentCutFilters = {
  clients?: number[]
  channels?: string[]
  channelGroups?: ChannelGroup[]
  publishers?: string[]
  buyTypes?: string[]
  markets?: string[]
  billingAgency?: Array<"AA" | "AM">
  /** Case-insensitive match over client name, campaign name, MBA, line_item_id, publisher. */
  search?: string
}

export type InvestmentCutRequest = {
  fy: number
  monthRange?: { from: string; to: string }
  basis: InvestmentCutBasis
  dimensions: InvestmentCutDim[]
  measures: InvestmentCutMeasure[]
  filters?: InvestmentCutFilters
  /** Seeded agency-economics preset id (historic FY gate applies even for fee/billable-only presets). */
  presetId?: string | null
}

export type InvestmentCutNormalized = {
  fy: number
  from: string
  to: string
  basis: InvestmentCutBasis
  dimensions: InvestmentCutDim[]
  measures: InvestmentCutMeasure[]
  filters: {
    clients: number[]
    channels: string[]
    channelGroups: ChannelGroup[]
    publishers: string[]
    buyTypes: string[]
    markets: string[]
    billingAgency: Array<"AA" | "AM">
    search: string
  }
}

export type InvestmentCutRow = {
  dims: Partial<Record<InvestmentCutDim, string | number | null>>
  measures: Partial<Record<InvestmentCutMeasure, number>>
}

export type InvestmentCutFeeCoverage = {
  mediaLineMonths: number
  feeLineMonths: number
  coveragePct: number
  caveat: string
}

export const FEE_COVERAGE_CAVEAT =
  "Per-month fee rows are incomplete for some published tips (legacy/ETL or media-only schedule_months when feeLoading was empty — O4.5/C-21). fee_cents and billable_cents understate agency fee where fee components are absent. Margin views must not treat fee_cents as complete: join mba_fee_snapshots and/or recompute from stamped feePct × media; never invent fee from billable−media."

export type InvestmentCutArCoverage = {
  /** % of booked billable (MBA×month) that has any AR invoice link. */
  matchedPct: number
  bookedBillableCents: number
  bookedWithArLinkCents: number
  note: string
}

export const AR_COVERAGE_NOTE =
  "AR link = xero_invoice_matches→finance_run_items when present, else xero_ar_invoices.mba_number (T5 reference parse). Grain is MBA×month — never prorated to publisher/channel."

export type InvestmentCutAgencyCoverage = {
  caption: string
  retainerMappingRef: string
  includeAdservingInRevenue: boolean
  sowNote: string
}

export type InvestmentCutCoverage = {
  publisherMatchedPct: number
  lineDetailPct: number
  lineDetailCents: number
  campaignLevelCents: number
  lineDetailNote: string
  rowCount: number
  scope: string
  basis: InvestmentCutBasis
  fee?: InvestmentCutFeeCoverage
  /** Present when any Actuals (Xero) measure is requested. */
  ar?: InvestmentCutArCoverage
  /** Present when agency-economics measures are requested. */
  agency?: InvestmentCutAgencyCoverage
}

export type InvestmentCutResponse = {
  scope: {
    fy: number
    from: string
    to: string
    basis: InvestmentCutBasis
    dimensions: InvestmentCutDim[]
    measures: InvestmentCutMeasure[]
    filters: InvestmentCutNormalized["filters"]
  }
  rows: InvestmentCutRow[]
  totals: Partial<Record<InvestmentCutMeasure, number>>
  coverage: InvestmentCutCoverage
  truncated: boolean
  rowCap: number
  _debugSql?: {
    cut: string
    feeCoverage: string
    publisherMatch: string
    arMbaMonth?: string
  }
}

export type InvestmentCutParseError = {
  error: string
  message: string
}

/** Typed 422 when Actuals measures + line-level dims/filters. */
export type InvestmentCutGrainError = ActualsGrainViolation
