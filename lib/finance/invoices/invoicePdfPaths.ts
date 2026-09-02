/** Client-safe PDF proxy paths. Do not import invoicePdf.ts from client components. */

export function arInvoicePdfPath(xeroInvoiceId: string): string {
  return `/api/finance/invoices/${encodeURIComponent(xeroInvoiceId)}/pdf`
}

export function apInvoicePdfPath(xeroInvoiceId: string): string {
  return `/api/finance/bills/${encodeURIComponent(xeroInvoiceId)}/pdf`
}
