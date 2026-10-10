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
}

/**
 * Next lifecycle step on the row. Sent-to-finance and beyond have no primary.
 * Approved rows are sent from the month bar, not a per-row Mark sent.
 * Does not read `records[0]` — caller passes the row's own state.
 */
export function invoicingPrimaryAction(
  state: BillingState | null | undefined
): InvoicingPrimaryKind | null {
  if (state === "ready" || state == null) return "approve"
  return null
}

export function invoicingPrimaryLabel(kind: InvoicingPrimaryKind): string {
  return kind === "approve" ? "Approve" : "Mark sent"
}

/**
 * Named parts that replace a blank media type. Order is the caption order
 * after any real media-type labels. A zero total is omitted.
 */
const TO_BILL_NAMED_PARTS = [
  "Fees",
  "Ad serving",
  "Production",
  "Retainer",
  "Untyped media",
  "Other",
] as const

const TO_BILL_NAMED_PART_SET = new Set<string>(TO_BILL_NAMED_PARTS)

function normToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

/**
 * Caption bucket for one billing line.
 *
 * A media line (`line_type` "media") keeps its `media_type`. A blank type is
 * "Untyped media".
 *
 * Service lines are identified the way `deriveReceivableRecords` and
 * `deriveRetainerReceivables` write them:
 * - Retainer: `line_type` "retainer", item code "Retainer", or description
 *   "Monthly retainer".
 * - Ad serving: item code "T.Adserving" or description "Adserving and Tech Fees".
 * - Production: `line_type` "service" with item code or description "Production".
 * - Fees: `line_type` "fee", item code "Service" or "FEE", or description
 *   "Assembled Fee", "Service fee", or "Fee".
 *
 * Anything else with a media type uses that type. A line that matches none of
 * these goes to "Other" so the caption still sums to the card.
 */
export function toBillCaptionLabel(li: BillingLineItem): string {
  const lineType = normToken(li.line_type)
  const itemCode = normToken(li.item_code)
  const description = normToken(li.description)
  const mediaType = (li.media_type ?? "").trim()

  if (lineType === "media") {
    return mediaType || "Untyped media"
  }

  if (
    lineType === "retainer" ||
    itemCode === "retainer" ||
    description === "monthly retainer"
  ) {
    return "Retainer"
  }

  if (itemCode === "t.adserving" || description === "adserving and tech fees") {
    return "Ad serving"
  }

  if (
    lineType === "service" &&
    (itemCode === "production" || description === "production")
  ) {
    return "Production"
  }

  if (
    lineType === "fee" ||
    itemCode === "fee" ||
    itemCode === "service" ||
    description === "assembled fee" ||
    description === "service fee" ||
    description === "fee"
  ) {
    return "Fees"
  }

  return mediaType || "Other"
}

/**
 * Same rollup math the previous stacked rows used (`InvoicingMediaPlanSection`).
 * Totals round to cents the same way; do not change the arithmetic.
 * Real media types stay in first-seen order. Named parts follow, and a part
 * whose rounded total is 0 is left out.
 */
export function buildMediaTypeRollups(records: BillingRecord[]): MediaTypeRollup[] {
  const byType = new Map<string, BillingLineItem[]>()
  const mediaOrder: string[] = []

  for (const rec of records) {
    for (const li of rec.line_items ?? []) {
      const key = toBillCaptionLabel(li)
      if (!byType.has(key)) {
        byType.set(key, [])
        if (!TO_BILL_NAMED_PART_SET.has(key)) mediaOrder.push(key)
      }
      byType.get(key)!.push(li)
    }
  }

  const order = [
    ...mediaOrder,
    ...TO_BILL_NAMED_PARTS.filter((part) => byType.has(part)),
  ]

  return order.flatMap((mediaType) => {
    const lineItems = byType.get(mediaType)!
    const total = Math.round(lineItems.reduce((s, li) => s + li.amount, 0) * 100) / 100
    if (total === 0) return []
    return [{ mediaType, total, lineItems }]
  })
}

/** One caption line: `Social Media $3,439.00 · Fees $859.75`. */
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
  record: Pick<BillingRecord, "billing_type" | "billing_month" | "total" | "client_name" | "clients_id">
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
