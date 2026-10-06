/**
 * Invoicing KPI funnel — same record.total dollars as the old strip, regrouped
 * into Ready / Approved / Issued outside AV / Sent-to-finance so those tiles add
 * to the scope total. Sent-to-finance includes every derived state past approved
 * except issued_outside_av. Needs attention is a differs count, not a dollar tile.
 */

import type { BillingState } from "@/lib/finance/billingLifecycle"

export type InvoicingFunnelBucketId = "ready" | "approved" | "sent_to_finance" | "issued_outside_av"

export type InvoicingFunnelRecord = {
  total: number
  state?: BillingState | null
  billing_month?: string | null
  needs_attention?: boolean
}

export type InvoicingFunnelBucket = {
  cents: number
  invoiceCount: number
  monthCount: number
}

export type InvoicingFunnelSummary = {
  totalCents: number
  ready: InvoicingFunnelBucket
  approved: InvoicingFunnelBucket
  sentToFinance: InvoicingFunnelBucket
  issuedOutsideAv: InvoicingFunnelBucket
  needsAttentionCount: number
}

export const INVOICING_FUNNEL_LABELS = {
  ready: "Ready to approve",
  approved: "Approved",
  sent_to_finance: "Sent to finance",
  issued_outside_av: "Issued outside AV",
} as const

/** To bill list filter. Independent of the campaign STATUS combobox. Default Ready. */
export type InvoicingLifecycleFilter = InvoicingFunnelBucketId | "all"

export const DEFAULT_INVOICING_LIFECYCLE_FILTER: InvoicingLifecycleFilter = "ready"

export function recordMatchesLifecycleFilter(
  state: BillingState | null | undefined,
  filter: InvoicingLifecycleFilter
): boolean {
  if (filter === "all") return true
  return invoicingFunnelBucket(state) === filter
}

export function invoicingFunnelBucket(
  state: BillingState | null | undefined
): InvoicingFunnelBucketId {
  if (state === "approved") return "approved"
  if (state === "issued_outside_av") return "issued_outside_av"
  if (state != null && state !== "ready") return "sent_to_finance"
  return "ready"
}

function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export function formatFunnelCountCaption(invoiceCount: number, monthCount: number): string {
  const invoices = invoiceCount === 1 ? "1 invoice" : `${invoiceCount} invoices`
  const months = monthCount === 1 ? "1 month" : `${monthCount} months`
  return `${invoices} · ${months}`
}

export function summariseInvoicingFunnel(
  records: readonly InvoicingFunnelRecord[]
): InvoicingFunnelSummary {
  const dollars = { ready: 0, approved: 0, sent_to_finance: 0, issued_outside_av: 0 }
  const invoiceCount = { ready: 0, approved: 0, sent_to_finance: 0, issued_outside_av: 0 }
  const months = {
    ready: new Set<string>(),
    approved: new Set<string>(),
    sent_to_finance: new Set<string>(),
    issued_outside_av: new Set<string>(),
  }
  let totalDollars = 0
  let needsAttentionCount = 0

  for (const record of records) {
    const bucket = invoicingFunnelBucket(record.state)
    dollars[bucket] += record.total
    invoiceCount[bucket] += 1
    const month = (record.billing_month ?? "").trim()
    if (month) months[bucket].add(month)
    totalDollars += record.total
    if (record.needs_attention) needsAttentionCount += 1
  }

  const bucketOf = (id: InvoicingFunnelBucketId): InvoicingFunnelBucket => ({
    cents: dollarsToCents(dollars[id]),
    invoiceCount: invoiceCount[id],
    monthCount: months[id].size,
  })

  return {
    totalCents: dollarsToCents(totalDollars),
    ready: bucketOf("ready"),
    approved: bucketOf("approved"),
    sentToFinance: bucketOf("sent_to_finance"),
    issuedOutsideAv: bucketOf("issued_outside_av"),
    needsAttentionCount,
  }
}
