/**
 * Extract comparable slices from media_plan_versions-shaped rows for conservative variance attribution.
 */

import { stableStringify } from "@/lib/finance/forecast/snapshot/serializeForSnapshotHash"
import {
  CLIENT_FIELD_FEE_SEARCH,
  CLIENT_FIELD_FEE_SOCIAL,
  CLIENT_FIELD_MONTHLY_RETAINER,
  FORECAST_MEDIA_TYPE_TO_PUBLISHER_COMMISSION_FIELDS,
} from "@/lib/finance/forecast/mapping/definitions"
import type { FinanceForecastMediaPlanVersionInput } from "@/lib/types/financeForecast"

export type VersionAttributionSlice = {
  id: string | null
  version_number: number | null
  status: string | null
  billingFingerprint: string
  deliveryFingerprint: string
  campaign_start_date: string | null
  campaign_end_date: string | null
  publisherFeeFingerprint: string
  clientFeeFingerprint: string
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>
  return {}
}

function billingOf(v: Record<string, unknown>): unknown {
  return v.billingSchedule ?? v.billing_schedule ?? null
}

function deliveryOf(v: Record<string, unknown>): unknown {
  return v.deliverySchedule ?? v.delivery_schedule ?? null
}

function publisherCommissionFingerprint(v: Record<string, unknown>): string {
  const pick: Record<string, unknown> = {}
  for (const pair of Object.values(FORECAST_MEDIA_TYPE_TO_PUBLISHER_COMMISSION_FIELDS)) {
    if (pair.canonical in v) pick[pair.canonical] = v[pair.canonical]
    if (pair.legacy in v) pick[pair.legacy] = v[pair.legacy]
  }
  for (const k of Object.keys(v)) {
    if (/^pub_.*comms$/i.test(k) && !(k in pick)) pick[k] = v[k]
  }
  return stableStringify(pick)
}

function clientFeeFingerprintFromVersion(v: Record<string, unknown>): string {
  const keys = [
    CLIENT_FIELD_FEE_SEARCH,
    CLIENT_FIELD_FEE_SOCIAL,
    CLIENT_FIELD_MONTHLY_RETAINER,
    "search_fee",
    "social_fee",
    "mp_search_fee",
    "mp_social_fee",
  ]
  const pick: Record<string, unknown> = {}
  for (const k of keys) {
    if (k in v && v[k] !== undefined && v[k] !== null) pick[k] = v[k]
  }
  return stableStringify(pick)
}

export function extractVersionAttributionSlice(
  raw: FinanceForecastMediaPlanVersionInput | Record<string, unknown> | null | undefined
): VersionAttributionSlice | null {
  if (raw == null) return null
  const v = asRecord(raw)
  const id = v.id != null ? String(v.id) : null
  const vn = v.version_number
  const version_number =
    typeof vn === "number"
      ? vn
      : typeof vn === "string" && vn.trim() !== ""
        ? Number.parseInt(vn, 10)
        : null

  const st =
    v.mp_campaignstatus != null && String(v.mp_campaignstatus).trim() !== ""
      ? String(v.mp_campaignstatus)
      : v.campaign_status != null
        ? String(v.campaign_status)
        : null

  return {
    id,
    version_number: Number.isFinite(version_number as number) ? (version_number as number) : null,
    status: st,
    billingFingerprint: stableStringify(billingOf(v)),
    deliveryFingerprint: stableStringify(deliveryOf(v)),
    campaign_start_date: v.campaign_start_date != null ? String(v.campaign_start_date) : null,
    campaign_end_date: v.campaign_end_date != null ? String(v.campaign_end_date) : null,
    publisherFeeFingerprint: publisherCommissionFingerprint(v),
    clientFeeFingerprint: clientFeeFingerprintFromVersion(v),
  }
}

/** Normalise status for conservative pattern matching (not for display). */
export function normalizeStatusBucket(status: string | null): string | null {
  if (status == null) return null
  const t = status.trim().toLowerCase()
  if (t.includes("draft")) return "draft"
  if (t.includes("approv") || t.includes("appro")) return "approved"
  if (t.includes("book")) return "booked"
  if (t.includes("cancel")) return "cancelled"
  if (t.includes("complet")) return "completed"
  return t
}
