/**
 * Browser-facing client for Manual Billing ↔ billing_overrides.
 * Hits Next.js API proxies (not Xano directly).
 */

import type { BillingOverrideReason, MonthAmount } from "@/lib/finance/campaignFinancials.types"
import type { BillingOverrideComponent, BillingOverrideRow } from "@/lib/finance/billingOverrides"

export type ReplaceBillingOverrideLineBody = {
  media_plan_version_id: string | number
  line_item_id: string
  component: BillingOverrideComponent
  mode?: "manual" | "auto"
  reason?: BillingOverrideReason | string
  months: MonthAmount[]
  date_basis: string
}

export type ResetBillingOverrideLineBody = {
  media_plan_version_id: string | number
  line_item_id: string
  component?: BillingOverrideComponent
}

export async function fetchBillingOverridesClient(
  versionId: string | number
): Promise<BillingOverrideRow[]> {
  const res = await fetch(
    `/api/billing-overrides?media_plan_version_id=${encodeURIComponent(String(versionId))}`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to load billing overrides (${res.status})`)
  }
  const data = await res.json()
  return Array.isArray(data?.overrides) ? data.overrides : Array.isArray(data) ? data : []
}

export async function replaceBillingOverrideLineClient(
  body: ReplaceBillingOverrideLineBody
): Promise<unknown> {
  const res = await fetch("/api/billing-overrides/replace_line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `replace_line failed (${res.status})`)
  }
  return res.json().catch(() => ({ ok: true }))
}

export async function resetBillingOverrideLineClient(
  body: ResetBillingOverrideLineBody
): Promise<unknown> {
  const res = await fetch("/api/billing-overrides/reset_line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `reset_line failed (${res.status})`)
  }
  return res.json().catch(() => ({ ok: true }))
}
