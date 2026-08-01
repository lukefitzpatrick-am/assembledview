/**
 * FIN-7 — display identity for pending finance_billing_records (assignment UX).
 * Lead text never falls back to invoice_key.
 */

export type PendingIdentityFields = {
  reference?: string | null
  first_line_description?: string | null
  invoice_number?: string | null
  contact_name?: string | null
  client_name?: string | null
}

/** reference → first line description → invoice_number → em dash (never invoice_key). */
export function pendingLeadText(row: PendingIdentityFields): string {
  const ref = String(row.reference ?? "").trim()
  if (ref) return ref
  const desc = String(row.first_line_description ?? "").trim()
  if (desc) return desc
  const inv = String(row.invoice_number ?? "").trim()
  if (inv) return inv
  return "—"
}

/**
 * Show Xero contact when it differs from billing client_name
 * (e.g. "Hema Maps" vs normalised "Hema").
 */
export function contactSecondaryLine(
  contactName?: string | null,
  clientName?: string | null
): string | null {
  const contact = String(contactName ?? "").trim()
  if (!contact) return null
  const client = String(clientName ?? "").trim()
  if (!client) return contact
  if (contact.toLowerCase() === client.toLowerCase()) return null
  return contact
}
