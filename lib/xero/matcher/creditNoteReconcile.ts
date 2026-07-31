/**
 * O7 — Dispute → expected credit note → auto-reconcile when negative AR arrives.
 * Pure helpers (no DB). Amounts within $0.01 via amountsWithinCent.
 */

import { amountsWithinCent } from "./threeTier"

export type DisputedMatch = {
  xeroInvoiceId: string
  runItemId: number | null
  /** Absolute cents on the disputed invoice (usually positive). */
  amountCents: number
  contactKey: string | null
  xeroContactId: string | null
}

export type CreditNoteCandidate = {
  xeroInvoiceId: string
  /** Credit notes land as negative totals in AR ingest. */
  amountCents: number
  contactKey: string | null
  xeroContactId: string | null
}

export type CreditNoteReconcileHit = {
  disputedInvoiceId: string
  creditNoteInvoiceId: string
  runItemId: number | null
  amountCents: number
}

function sameContact(a: DisputedMatch, b: CreditNoteCandidate): boolean {
  if (a.xeroContactId && b.xeroContactId && a.xeroContactId === b.xeroContactId) {
    return true
  }
  if (a.contactKey && b.contactKey && a.contactKey === b.contactKey) {
    return true
  }
  return false
}

/** True when the AR row is a credit-note-shaped document (negative total). */
export function isCreditNoteAmount(amountCents: number): boolean {
  return Number.isFinite(amountCents) && amountCents < 0
}

/**
 * Find an unused credit note for a disputed match:
 * same contact + abs(amount) within $0.01 of the disputed invoice.
 */
export function matchCreditNoteToDispute(
  dispute: DisputedMatch,
  creditNotes: CreditNoteCandidate[],
  usedCreditIds: Set<string> = new Set()
): CreditNoteCandidate | null {
  const target = Math.abs(Math.round(dispute.amountCents))
  if (target <= 0) return null

  for (const cn of creditNotes) {
    if (usedCreditIds.has(cn.xeroInvoiceId)) continue
    if (!isCreditNoteAmount(cn.amountCents)) continue
    if (cn.xeroInvoiceId === dispute.xeroInvoiceId) continue
    if (!sameContact(dispute, cn)) continue
    if (!amountsWithinCent(Math.abs(Math.round(cn.amountCents)), target)) continue
    return cn
  }
  return null
}

/** Batch: pair each dispute to at most one credit note. */
export function reconcileDisputesWithCreditNotes(args: {
  disputes: DisputedMatch[]
  creditNotes: CreditNoteCandidate[]
}): CreditNoteReconcileHit[] {
  const used = new Set<string>()
  const hits: CreditNoteReconcileHit[] = []
  for (const d of args.disputes) {
    const cn = matchCreditNoteToDispute(d, args.creditNotes, used)
    if (!cn) continue
    used.add(cn.xeroInvoiceId)
    hits.push({
      disputedInvoiceId: d.xeroInvoiceId,
      creditNoteInvoiceId: cn.xeroInvoiceId,
      runItemId: d.runItemId,
      amountCents: Math.abs(Math.round(d.amountCents)),
    })
  }
  return hits
}

/**
 * Shape stored on `xero_match_expected_credit_note` when Dispute is pressed.
 * The notification row is the pre-created expected credit-note record.
 */
export function buildExpectedCreditNotePayload(args: {
  xeroInvoiceId: string
  runItemId: number | null
  amountCents: number
  contactKey: string | null
  xeroContactId: string | null
  expectedCreditNoteRef?: string | null
  reason: string
}): Record<string, unknown> {
  return {
    xeroInvoiceId: args.xeroInvoiceId,
    runItemId: args.runItemId,
    expectedAmountCents: Math.abs(Math.round(args.amountCents)),
    contactKey: args.contactKey,
    xeroContactId: args.xeroContactId,
    expectedCreditNoteRef: args.expectedCreditNoteRef ?? null,
    reason: args.reason,
    preCreated: true,
  }
}
