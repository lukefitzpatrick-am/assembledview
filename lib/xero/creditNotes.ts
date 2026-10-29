/**
 * Xero credit notes (true-up T9). Xero returns credit notes from /CreditNotes,
 * not /Invoices. Sales credit notes (ACCRECCREDIT) land in xero_ar_invoices
 * as negative amounts, so the true-up counts them and the O7 dispute flow
 * closes a disputed match when one arrives.
 *
 * Off unless XERO_SYNC_CREDIT_NOTES is exactly "true". Purchase credit notes
 * (ACCPAYCREDIT) are skipped by the upsert.
 *
 * Readers that show or bill invoices exclude credit notes with
 * arNotCreditNoteSql: the client invoice list and its PDFs, the PDF sync
 * (it fetches /Invoices/{id}), the Xero to Clients billing import and the
 * billing record matcher.
 */

import type { XeroInvoice } from "./stages/ingestInvoices"

export const CREDIT_NOTE_PAGES_CAP = 10

export function isXeroCreditNoteSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.XERO_SYNC_CREDIT_NOTES ?? "").trim() === "true"
}

export type XeroCreditNote = {
  CreditNoteID: string
  CreditNoteNumber?: string
  Type?: string
  Status?: string
  SubTotal?: number
  TotalTax?: number
  Total?: number
  RemainingCredit?: number
  CurrencyCode?: string
  DateString?: string
  Reference?: string
  LineItems?: unknown
  LineAmountTypes?: string
  UpdatedDateUTC?: string
  SentToContact?: boolean
  Contact?: { ContactID?: string }
  [key: string]: unknown
}

/**
 * The invoice shape the upsert takes. Amount paid and due are 0 so a credit
 * note never shows as owed or overdue; the remaining credit stays in raw_json.
 */
export function creditNoteToXeroInvoice(cn: XeroCreditNote): XeroInvoice & Record<string, unknown> {
  return {
    ...cn,
    InvoiceID: cn.CreditNoteID,
    InvoiceNumber: cn.CreditNoteNumber,
    AmountPaid: 0,
    AmountDue: 0,
    DueDateString: undefined,
  }
}

/** Raw SQL predicate: the AR row is not a sales credit note. `alias` is the table alias, if any. */
export function arNotCreditNoteSql(alias?: string): string {
  const col = alias ? `${alias}.raw_json` : "raw_json"
  return `coalesce(upper(${col}->>'Type'), '') <> 'ACCRECCREDIT'`
}
