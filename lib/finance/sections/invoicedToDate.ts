/**
 * Overview "Invoiced to date" caption. The figure itself is the SQL in
 * `summaryQuery.ts` (`billed IS TRUE` + `billed_amount_cents` + `invoice_key LIKE 'xero:%'`).
 * Do not add a second JS summer — it will drift from that query.
 */

export const INVOICED_TO_DATE_BASIS = "Invoiced = Xero AR, ex-GST"
