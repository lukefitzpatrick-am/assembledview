/**
 * Overview "Invoiced to date" — Xero AR is the record of what was actually
 * invoiced. The app's own billed flag (media:/sow:/retainer:) is intent, not
 * an invoice. Amounts are ex-GST (T0-2).
 */

export const INVOICED_TO_DATE_BASIS = "Invoiced = Xero AR, ex-GST"

export type InvoicedToDateRow = {
  invoice_key: string
  billed: boolean
  billed_amount_cents: number | null
}

export function qualifiesForInvoicedToDate(row: InvoicedToDateRow): boolean {
  return (
    row.billed === true &&
    row.billed_amount_cents != null &&
    row.invoice_key.startsWith("xero:")
  )
}

export function sumInvoicedToDateCents(rows: InvoicedToDateRow[]): number {
  let cents = 0
  for (const row of rows) {
    if (qualifiesForInvoicedToDate(row)) cents += row.billed_amount_cents ?? 0
  }
  return cents
}
