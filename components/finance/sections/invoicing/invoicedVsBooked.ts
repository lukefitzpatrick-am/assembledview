import type { BillingRecord } from "@/lib/types/financeBilling"
import { formatAUD } from "@/lib/format/money"

/** Display-only: invoiced (`billed_amount` dollars from overlay) vs booked (`total`). */
export function formatInvoicedVsBooked(rec: BillingRecord): string {
  const booked = formatAUD(rec.total)
  const inv = rec.billed_amount
  if (inv == null || !Number.isFinite(Number(inv))) return `— / ${booked}`
  return `${formatAUD(Number(inv))} / ${booked}`
}

export function formatInvoicedVsBookedForRecords(records: BillingRecord[]): string {
  if (records.length === 0) return "— / —"
  const booked = records.reduce((s, r) => s + r.total, 0)
  let hasInvoiced = false
  let invoiced = 0
  for (const r of records) {
    if (r.billed_amount != null && Number.isFinite(Number(r.billed_amount))) {
      hasInvoiced = true
      invoiced += Number(r.billed_amount)
    }
  }
  const bookedLabel = formatAUD(Math.round(booked * 100) / 100)
  if (!hasInvoiced) return `— / ${bookedLabel}`
  return `${formatAUD(Math.round(invoiced * 100) / 100)} / ${bookedLabel}`
}
