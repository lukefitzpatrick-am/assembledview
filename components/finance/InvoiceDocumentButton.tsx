"use client"

import { Button } from "@/components/ui/button"
import { arInvoicePdfPath } from "@/lib/finance/invoices/invoicePdfPaths"

export function InvoiceDocumentButton({
  xeroInvoiceId,
  invoiceNumber,
  available,
}: {
  xeroInvoiceId: string
  invoiceNumber?: string | null
  available: boolean
}) {
  if (!available) return null

  const label = invoiceNumber?.trim()
    ? `Invoice ${invoiceNumber.trim()}`
    : "Invoice"

  return (
    <Button asChild variant="secondary" size="sm">
      <a href={arInvoicePdfPath(xeroInvoiceId)} aria-label={label}>
        📄 Invoice
      </a>
    </Button>
  )
}
