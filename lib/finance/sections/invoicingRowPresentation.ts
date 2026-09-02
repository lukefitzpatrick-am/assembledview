/**
 * Clients billing card presentation. Figures stay on the existing record/group
 * totals — this file only decides labels, captions, and which pre-run predicates
 * to surface. Do not import period orchestrators.
 */

import { clientMissingBlockers, type PreRunBlocker } from "@/lib/finance/periods/preRunSweep"
import { formatAUD } from "@/lib/format/money"
import type { BillingState } from "@/lib/finance/billingLifecycle"
import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"

/** Two columns from 700px; one column below. Tailwind `md` is 768px — too wide. */
export const INVOICING_CLIENT_GRID_CLASS =
  "grid grid-cols-1 min-[700px]:grid-cols-2 gap-4"

export const INVOICING_EX_GST_HEADER = "All amounts ex-GST"

export type InvoicingPrimaryKind = "approve" | "mark_sent"

export type MediaTypeRollup = {
  mediaType: string
  total: number
  lineItems: BillingLineItem[]
}

export type InvoicingClientBlockerMeta = {
  abn: string
  legalBusinessName: string
  poRequired: boolean
}

/**
 * Next lifecycle step on the row. Sent-to-finance and beyond have no primary.
 * Does not read `records[0]` — caller passes the row's own state.
 */
export function invoicingPrimaryAction(
  state: BillingState | null | undefined
): InvoicingPrimaryKind | null {
  if (state === "ready" || state == null) return "approve"
  if (state === "approved") return "mark_sent"
  return null
}

export function invoicingPrimaryLabel(kind: InvoicingPrimaryKind): string {
  return kind === "approve" ? "Approve" : "Mark sent"
}

/**
 * Same rollup math the previous stacked rows used (`InvoicingMediaPlanSection`).
 * Totals round to cents the same way; do not change the arithmetic.
 */
export function buildMediaTypeRollups(records: BillingRecord[]): MediaTypeRollup[] {
  const byType = new Map<string, BillingLineItem[]>()
  const order: string[] = []

  for (const rec of records) {
    for (const li of rec.line_items ?? []) {
      const key = (li.media_type ?? "").trim() || "Other"
      if (!byType.has(key)) {
        byType.set(key, [])
        order.push(key)
      }
      byType.get(key)!.push(li)
    }
  }

  return order.map((mediaType) => {
    const lineItems = byType.get(mediaType)!
    const total = Math.round(lineItems.reduce((s, li) => s + li.amount, 0) * 100) / 100
    return { mediaType, total, lineItems }
  })
}

/** One caption line: `Social Media $2,625.00 · Other $292.00`. */
export function formatMediaTypeCaption(rollups: MediaTypeRollup[]): string {
  return rollups.map((r) => `${r.mediaType} ${formatAUD(r.total)}`).join(" · ")
}

/**
 * Scope $0 / missing month — the pre-run file has no exported predicate for this.
 * A sow row with an empty month or a non-positive total is the same gap
 * `summarizeScopeScheduleCoverage` describes on the list UI.
 */
export function scopeMonthBlocker(record: {
  billing_type: BillingRecord["billing_type"]
  billing_month: string
  total: number
  client_name?: string
  clients_id?: number
}): PreRunBlocker | null {
  if (record.billing_type !== "sow") return null
  const monthMissing = !String(record.billing_month ?? "").trim()
  const zeroOrMissing = !Number.isFinite(record.total) || record.total <= 0
  if (!monthMissing && !zeroOrMissing) return null
  const name = record.client_name?.trim() || "Client"
  return {
    kind: "unapproved_scheduled",
    clientId: record.clients_id,
    clientName: name,
    detail: `${name}: scope has a $0 or missing month`,
  }
}

export function invoicingRowBlockers(input: {
  clientsId: number
  clientName: string
  record: Pick<BillingRecord, "billing_type" | "billing_month" | "total" | "po_number" | "client_name" | "clients_id">
  clientMeta?: InvoicingClientBlockerMeta | null
}): PreRunBlocker[] {
  const out: PreRunBlocker[] = []
  if (input.clientMeta) {
    out.push(
      ...clientMissingBlockers({
        id: input.clientsId,
        name: input.clientName,
        abn: input.clientMeta.abn,
        legalBusinessName: input.clientMeta.legalBusinessName,
        poRequired: input.clientMeta.poRequired,
        poNumber: input.record.po_number,
      })
    )
  }
  const scope = scopeMonthBlocker({
    billing_type: input.record.billing_type,
    billing_month: input.record.billing_month,
    total: input.record.total,
    client_name: input.record.client_name ?? input.clientName,
    clients_id: input.record.clients_id ?? input.clientsId,
  })
  if (scope) out.push(scope)
  return out
}

export function invoicingBlockerReasons(blockers: PreRunBlocker[]): string[] {
  return blockers.map((b) => b.detail)
}
