/**
 * Classic Xero AR deep link. Constructible from `xero_invoice_id` alone —
 * no org short-code in env. The logged-in Xero session picks the tenant.
 */

export function xeroArInvoiceViewUrl(xeroInvoiceId: string): string | null {
  const id = xeroInvoiceId.trim()
  if (!id) return null
  return `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(id)}`
}
