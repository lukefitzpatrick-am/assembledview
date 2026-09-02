import { formatAUD } from "@/lib/format/money"

export const INVOICING_EXCEL_DISABLED_REASON = "Only approved invoices export."

export function invoicingBulkApproveButtonLabel(count: number): string {
  return count > 0 ? `Approve ready (${count})` : "Approve ready"
}

export function invoicingBulkApproveConfirmCopy(input: {
  count: number
  amountDollars: number
  monthLabel: string
}): { title: string; description: string; confirm: string } {
  const invoices = input.count === 1 ? "1 invoice" : `${input.count} invoices`
  return {
    title: "Approve ready invoices?",
    description: `Approve ${invoices} totalling ${formatAUD(input.amountDollars)} for ${input.monthLabel}.`,
    confirm: "Approve",
  }
}
