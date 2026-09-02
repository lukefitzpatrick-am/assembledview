/**
 * Owed ledger presentation. Ageing and matching stay in owedLedger.ts —
 * this file only decides sort, the locked-null primary, and overflow.
 */

import { compareValues, type SortDirection } from "@/components/ui/sortable-table-header"
import type { BillingState } from "@/lib/finance/billingLifecycle"
import type { OwedLedgerRow } from "@/lib/finance/sections/owedLedger"
import { xeroArInvoiceViewUrl } from "@/lib/xero/invoiceUrl"

export type OwedSortColumn = "dueDate" | "outstanding"

/** Owed reports. A primary here would be dunning. */
export function owedPrimaryAction(_state: BillingState | null | undefined): null {
  return null
}

export function sortOwedLedgerRows(
  rows: OwedLedgerRow[],
  column: OwedSortColumn,
  direction: Exclude<SortDirection, null>
): OwedLedgerRow[] {
  const valueOf = (row: OwedLedgerRow) =>
    column === "dueDate" ? row.dueDate ?? "" : row.outstandingCents
  return rows.toSorted((a, b) => compareValues(valueOf(a), valueOf(b), direction))
}

export function owedOverflowItems(invoiceKey: string): { label: string; href: string }[] {
  const href = xeroArInvoiceViewUrl(invoiceKey)
  if (!href) return []
  return [{ label: "Open in Xero", href }]
}
