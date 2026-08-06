/**
 * Pure classification helpers for Finance Forecast — driven by `definitions.ts`.
 * Snapshot and variance layers can reuse these without importing the full dataset builder.
 */

import type { FinanceForecastPublisherInput } from "@/lib/types/financeForecast"
import type { ForecastBillingAgencyNormalized, ForecastRevenueCommissionBucket } from "./types"
import {
  FORECAST_DIRECT_MANAGED_DIGITAL_MEDIA_TYPE_KEYS,
  FORECAST_MEDIA_TYPE_TO_PUBLISHER_COMMISSION_FIELDS,
  FORECAST_SEARCH_SOCIAL_MEDIA_TYPE_KEYS,
  PUBLISHER_BILLING_AGENCY_ADVERTISING_ASSOCIATES,
  PUBLISHER_BILLING_AGENCY_ASSEMBLED_MEDIA,
  PUBLISHER_TYPE_DIRECT,
} from "./definitions"
import {
  retainedCommissionRate,
  type RetainedCommissionLogContext,
} from "@/lib/finance/retainedCommission"

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
 * Unknown publisher agency defaults to Assembled Media (`PUBLISHER_BILLING_AGENCY_ASSEMBLED_MEDIA`).
 */
export function splitBillableAmountByBillingEntity(args: {
  publisher: FinanceForecastPublisherInput
  mediaAmount: number
}): { advertisingAssociates: number; assembledMedia: number } {
  const rawAgency = args.publisher.billingagency
  let bucket = normalizePublisherBillingAgency(rawAgency)
  if (bucket === "unknown") {
    bucket = "assembled_media"
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
 * Returns raw numeric as stored (whole percent — see `applyForecastCommissionRate`).
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

/** Process-local once-flag — never blocks; mirrors `[savePlan-adserving-zero]`. */
let forecastCommissionScaleTripwireLogged = false

/**
 * Always-on, never-blocking tripwire: a `*_comms` value in (0, 1] after the
 * 2026-08-04 whole-percent normalisation is a data error, not a decimal unit.
 * Logs `[forecast-commission-scale]` once per process — does not throw.
 */
export function logForecastCommissionScaleTripwire(commsRaw: number): void {
  if (!(commsRaw > 0 && commsRaw <= 1)) return
  if (forecastCommissionScaleTripwireLogged) return
  forecastCommissionScaleTripwireLogged = true
  console.error("[forecast-commission-scale]", {
    message:
      "publisher *_comms in (0,1] after whole-percent normalisation — treating as whole percent /100 (data error, not decimal fraction)",
    commsRaw,
  })
}

/**
 * Convert GROSS media $ × stored comms rate → retained commission $.
 * Retained rate = max(0, rate − AA_COMMISSION_RATE) (see retainedCommission.ts).
 * Unconditional whole-percent after clamp (`retained / 100`). Safe: DB normalised
 * 2026-08-04; (0,1] band is a data error, not a different unit.
 *
 * Client-pays lines earn nothing — asserted here so a caller that forgot the
 * extractBillableLines skip cannot accidentally commission them.
 */
export function applyForecastCommissionRate(
  mediaAmount: number,
  commsRaw: number,
  opts?: RetainedCommissionLogContext & { clientPaysForMedia?: boolean }
): number {
  // Client-pays: media is not agency-billable — never earn commission.
  if (opts?.clientPaysForMedia) return 0
  if (!Number.isFinite(mediaAmount) || mediaAmount <= 0) return 0
  if (!Number.isFinite(commsRaw)) return 0
  logForecastCommissionScaleTripwire(commsRaw)
  const retainedPct = retainedCommissionRate(commsRaw, {
    publisher: opts?.publisher,
    lineItemId: opts?.lineItemId,
  })
  if (retainedPct <= 0) return 0
  return round2(mediaAmount * (retainedPct / 100))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
