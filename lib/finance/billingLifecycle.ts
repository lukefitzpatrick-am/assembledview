/**
 * Client billing lifecycle — derived from evidence, never stored.
 *
 * VOIDED / DELETED invoices are treated as absent before any Xero rule, so
 * amountDue 0 on a voided invoice cannot stamp `paid`.
 */

import { sydneyCivilParts } from "@/lib/codex/quickAddParse"
import { sydneyYmdFromUtcInstant } from "@/lib/myhours/sydneyWeek"

export type BillingState =
  | "ready"
  | "approved"
  | "sent_to_finance"
  | "drafted"
  | "issued"
  | "paid"
  | "overdue"

export type BillingXeroEvidence = {
  status: string
  amountDue: number
  dueDate: string | null
  fullyPaidDate: string | null
}

export type ResolveBillingStateInput = {
  approvedAt: string | null
  exportedAt: string | null
  xero: BillingXeroEvidence | null
  today?: Date
}

const ABSENT_XERO_STATUSES = new Set(["VOIDED", "DELETED"])

function stampPresent(value: string | null): boolean {
  return value != null && String(value).trim().length > 0
}

function xeroStatus(status: string): string {
  return status.trim().toUpperCase()
}

/** Xero `date` columns are civil YYYY-MM-DD; datetimes convert via Sydney. */
function evidenceToSydneyYmd(value: string | null): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  try {
    return sydneyYmdFromUtcInstant(trimmed)
  } catch {
    return null
  }
}

function liveXero(xero: BillingXeroEvidence | null): BillingXeroEvidence | null {
  if (!xero) return null
  if (ABSENT_XERO_STATUSES.has(xeroStatus(xero.status))) return null
  return xero
}

/**
 * True when any evidence exists past "nothing has happened".
 * Used by invoicing grouping, KPI outstanding, and the inline amount confirm.
 */
export function hasBillingEvidence(state: BillingState | null | undefined): boolean {
  return state != null && state !== "ready"
}

export function resolveBillingState(input: ResolveBillingStateInput): {
  state: BillingState
  reason: string
} {
  const todayYmd = sydneyCivilParts(input.today ?? new Date()).ymd
  const xero = liveXero(input.xero)

  if (xero) {
    const status = xeroStatus(xero.status)
    const amountDue = Number(xero.amountDue)
    const dueYmd = evidenceToSydneyYmd(xero.dueDate)
    const fullyPaid = stampPresent(xero.fullyPaidDate)

    if (status === "PAID" || (Number.isFinite(amountDue) && amountDue <= 0) || fullyPaid) {
      return { state: "paid", reason: "Xero invoice is paid (status, amount due, or fully paid date)" }
    }
    if (
      status === "AUTHORISED" &&
      dueYmd != null &&
      dueYmd < todayYmd &&
      Number.isFinite(amountDue) &&
      amountDue > 0
    ) {
      return { state: "overdue", reason: "Xero AUTHORISED invoice is past due with amount outstanding" }
    }
    if (status === "AUTHORISED") {
      return { state: "issued", reason: "Xero invoice is AUTHORISED" }
    }
    if (status === "DRAFT") {
      return { state: "drafted", reason: "Xero invoice is DRAFT" }
    }
  }

  if (stampPresent(input.exportedAt)) {
    return { state: "sent_to_finance", reason: "Sheet exported to finance" }
  }
  if (stampPresent(input.approvedAt)) {
    return { state: "approved", reason: "Month approved" }
  }
  return { state: "ready", reason: "No approval, export, or live Xero invoice" }
}
