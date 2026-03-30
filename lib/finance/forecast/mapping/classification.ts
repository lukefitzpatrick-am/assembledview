/**
 * Pure classification helpers for Finance Forecast — driven by `definitions.ts`.
 * Snapshot and variance layers can reuse these without importing the full dataset builder.
 */

import type { FinanceForecastPublisherInput } from "@/lib/types/financeForecast"
import type { ForecastBillingAgencyNormalized, ForecastRevenueCommissionBucket } from "./types"
import {
  DEFAULT_UNKNOWN_PUBLISHER_BILLING_AGENCY,
  FORECAST_COMMISSION_RATE_GREATER_THAN_ONE_IS_PERCENT,
  FORECAST_DIRECT_MANAGED_DIGITAL_MEDIA_TYPE_KEYS,
  FORECAST_MEDIA_TYPE_TO_PUBLISHER_COMMISSION_FIELDS,
  FORECAST_SEARCH_SOCIAL_MEDIA_TYPE_KEYS,
  PUBLISHER_BILLING_AGENCY_ADVERTISING_ASSOCIATES,
  PUBLISHER_BILLING_AGENCY_ASSEMBLED_MEDIA,
  PUBLISHER_TYPE_DIRECT,
} from "./definitions"

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
}

/**
 * Normalise `publishers.billingagency` to a stable bucket for AA vs AM forecast lines.
 */
export function normalizePublisherBillingAgency(
  billingagency: unknown
): ForecastBillingAgencyNormalized {
  const a = norm(billingagency)
  if (a === norm(PUBLISHER_BILLING_AGENCY_ADVERTISING_ASSOCIATES)) return "advertising_associates"
  if (a === norm(PUBLISHER_BILLING_AGENCY_ASSEMBLED_MEDIA)) return "assembled_media"
  return "unknown"
}

/**
 * Split a billable media amount into Advertising Associates vs Assembled Media billing lines.
 * Unknown publisher agency follows `DEFAULT_UNKNOWN_PUBLISHER_BILLING_AGENCY` (see definitions).
 */
export function splitBillableAmountByBillingEntity(args: {
  publisher: FinanceForecastPublisherInput
  mediaAmount: number
}): { advertisingAssociates: number; assembledMedia: number } {
  const rawAgency = args.publisher.billingagency
  let bucket = normalizePublisherBillingAgency(rawAgency)
  if (bucket === "unknown") {
    bucket =
      norm(DEFAULT_UNKNOWN_PUBLISHER_BILLING_AGENCY) ===
      norm(PUBLISHER_BILLING_AGENCY_ADVERTISING_ASSOCIATES)
        ? "advertising_associates"
        : "assembled_media"
  }

  if (bucket === "advertising_associates") {
    return { advertisingAssociates: args.mediaAmount, assembledMedia: 0 }
  }
  return { advertisingAssociates: 0, assembledMedia: args.mediaAmount }
}

const searchSocialSet = new Set<string>(FORECAST_SEARCH_SOCIAL_MEDIA_TYPE_KEYS)
const directDigitalSet = new Set<string>(FORECAST_DIRECT_MANAGED_DIGITAL_MEDIA_TYPE_KEYS)

/**
 * Routes a schedule line (after media type + publisher resolution) into one of three
 * commission buckets that map to forecast revenue rows.
 */
export function resolveRevenueCommissionBucket(args: {
  mediaTypeKey: string
  publishertype: unknown
}): ForecastRevenueCommissionBucket {
  const mk = args.mediaTypeKey
  if (searchSocialSet.has(mk)) return "search_social"
  if (directDigitalSet.has(mk) && norm(args.publishertype) === norm(PUBLISHER_TYPE_DIRECT)) {
    return "direct_managed_digital"
  }
  return "commission_other"
}

/**
 * Read commission **rate** from publisher row for a given internal media type key.
 * Returns raw numeric as stored in Xano (see `FORECAST_COMMISSION_RATE_GREATER_THAN_ONE_IS_PERCENT`).
 */
export function readPublisherCommissionRate(
  publisher: FinanceForecastPublisherInput | null,
  mediaTypeKey: string
): number {
  if (!publisher) return 0
  const pair = FORECAST_MEDIA_TYPE_TO_PUBLISHER_COMMISSION_FIELDS[mediaTypeKey]
  if (!pair) return 0
  const p = publisher as Record<string, unknown>
  for (const k of [pair.canonical, pair.legacy]) {
    const v = Number(p[k])
    if (Number.isFinite(v) && v > 0) return v
  }
  return 0
}

/**
 * Convert media $ × stored comms rate → commission $ (see definitions for scale rule).
 */
export function applyForecastCommissionRate(mediaAmount: number, commsRaw: number): number {
  if (!Number.isFinite(mediaAmount) || mediaAmount <= 0 || commsRaw <= 0) return 0
  if (!FORECAST_COMMISSION_RATE_GREATER_THAN_ONE_IS_PERCENT) {
    return round2(mediaAmount * commsRaw)
  }
  const rate = commsRaw <= 1 ? commsRaw : commsRaw / 100
  return round2(mediaAmount * rate)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
