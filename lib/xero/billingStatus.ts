/**
 * Map Xero invoice Status → finance_billing_records.status.
 * Exact mirror of xero/import_billing_records.
 */
export type BillingRecordStatus =
  | "paid"
  | "invoiced"
  | "cancelled"
  | "draft"

export function mapXeroStatusToBillingStatus(
  xeroStatus: string | null | undefined,
): BillingRecordStatus {
  switch (xeroStatus) {
    case "PAID":
      return "paid"
    case "AUTHORISED":
    case "SUBMITTED":
      return "invoiced"
    case "VOIDED":
    case "DELETED":
      return "cancelled"
    case "DRAFT":
      return "draft"
    default:
      return "invoiced"
  }
}

export type BillingType = "media" | "retainer" | "sow"

export function inferBillingType(
  referenceRaw: string,
  firstLineDescription: string,
): BillingType {
  const ref = referenceRaw.toLowerCase()
  const desc = firstLineDescription.toLowerCase()
  if (ref.includes("retainer") || desc.includes("retainer")) return "retainer"
  if (ref.includes("_sow") || ref.includes("scope of work")) return "sow"
  return "media"
}

/** PO from " | "-split segments starting with "PO ", else whole ref if it starts with "PO ". */
export function parsePoNumber(referenceRaw: string): string {
  const ref = referenceRaw ?? ""
  if (ref.includes(" | ")) {
    for (const seg of ref.split(" | ")) {
      const t = seg.trim()
      if (t.startsWith("PO ")) return t
    }
    return ""
  }
  const trimmed = ref.trim()
  if (trimmed.startsWith("PO ")) return trimmed
  return ""
}

export function xeroInvoiceKey(xeroInvoiceId: string): string {
  return `xero:${xeroInvoiceId}`
}

/** True when invoice_key belongs to the app-written schemes — never touch these. */
export function isAppInvoiceKey(invoiceKey: string): boolean {
  return (
    invoiceKey.startsWith("media:") ||
    invoiceKey.startsWith("sow:") ||
    invoiceKey.startsWith("retainer:")
  )
}
