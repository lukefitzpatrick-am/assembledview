/**
 * Build run candidates from already-fetched billing month rows (pure).
 * Media amount = sum of BILLING schedule_months for the period (cents).
 */

import {
  mediaInvoiceReference,
  mediaNaturalKey,
  retainerInvoiceReference,
  retainerNaturalKey,
  sowInvoiceReference,
  sowNaturalKey,
} from "@/lib/finance/periods/naturalKeys"
import { dollarsToCents, isRetainerActiveForPeriod } from "@/lib/finance/periods/retainerEligibility"
import type { RunCandidate } from "@/lib/finance/periods/types"
import { toPeriodMonthKey } from "@/lib/finance/periods/monthKey"

export type MediaMonthAgg = {
  mbaNumber: string
  clientId: number | null
  versionId: number
  amountCents: number
  lineItemsJson: unknown
  /** Hard blockers → held */
  heldReason?: string | null
}

export type RetainerClient = {
  id: number
  name: string
  mbaIdentifier?: string | null
  monthlyRetainer: number
  retainerEndMonth?: string | null
  heldReason?: string | null
}

export type SowMonthAgg = {
  sowId: number
  clientId: number | null
  amountCents: number
  lineItemsJson: unknown
  heldReason?: string | null
}

export function buildMediaCandidates(
  periodMonth: string,
  rows: MediaMonthAgg[]
): RunCandidate[] {
  const key = toPeriodMonthKey(periodMonth)
  return rows.map((r) => ({
    source: "media" as const,
    naturalKey: mediaNaturalKey(r.mbaNumber, r.versionId),
    mbaNumber: r.mbaNumber,
    clientId: r.clientId,
    versionId: r.versionId,
    sowId: null,
    lineItemsJson: r.lineItemsJson,
    amountCents: r.amountCents,
    invoiceReference: mediaInvoiceReference(r.mbaNumber, key),
    heldReason: r.heldReason ?? null,
  }))
}

export function buildRetainerCandidates(
  periodMonth: string,
  clients: RetainerClient[]
): RunCandidate[] {
  const key = toPeriodMonthKey(periodMonth)
  const out: RunCandidate[] = []
  for (const c of clients) {
    if (
      !isRetainerActiveForPeriod({
        monthlyRetainer: c.monthlyRetainer,
        retainerEndMonth: c.retainerEndMonth,
        periodMonth: key,
      })
    ) {
      continue
    }
    const clientKey = c.mbaIdentifier?.trim() || String(c.id)
    out.push({
      source: "retainer",
      naturalKey: retainerNaturalKey(c.id),
      mbaNumber: null,
      clientId: c.id,
      versionId: null,
      sowId: null,
      lineItemsJson: {
        description: "Monthly retainer",
        clientName: c.name,
        amount: c.monthlyRetainer,
      },
      amountCents: dollarsToCents(c.monthlyRetainer),
      invoiceReference: retainerInvoiceReference(clientKey, key),
      heldReason: c.heldReason ?? null,
    })
  }
  return out
}

export function buildSowCandidates(periodMonth: string, rows: SowMonthAgg[]): RunCandidate[] {
  const key = toPeriodMonthKey(periodMonth)
  return rows.map((r) => ({
    source: "sow" as const,
    naturalKey: sowNaturalKey(r.sowId),
    mbaNumber: null,
    clientId: r.clientId,
    versionId: null,
    sowId: r.sowId,
    lineItemsJson: r.lineItemsJson,
    amountCents: r.amountCents,
    invoiceReference: sowInvoiceReference(r.sowId, key),
    heldReason: r.heldReason ?? null,
  }))
}
