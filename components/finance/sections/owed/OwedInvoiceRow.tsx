"use client"

import { BillingStateBadge } from "@/components/finance/BillingStateBadge"
import { InvoiceDocumentButton } from "@/components/finance/InvoiceDocumentButton"
import { RowActionMenu } from "@/components/finance/RowActionMenu"
import { TableCell, TableRow } from "@/components/ui/table"
import { owedOverflowItems } from "@/lib/finance/sections/owedPresentation"
import type { OwedLedgerRow } from "@/lib/finance/sections/owedLedger"
import { formatDateShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"

function moneyCell(cents: number): string {
  return formatMoney(cents / 100)
}

export function OwedInvoiceRow({ row }: { row: OwedLedgerRow }) {
  const overflow = owedOverflowItems(row.invoiceKey)

  return (
    <TableRow className="interactive-row">
      <TableCell className="text-xs">
        <p className="truncate font-medium">{row.clientName}</p>
        {row.contactName &&
        row.contactName.toLowerCase() !== row.clientName.toLowerCase() ? (
          <p className="truncate text-[11px] text-muted-foreground" title={row.contactName}>
            {row.contactName}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="num text-xs">{row.invoiceNumber}</TableCell>
      <TableCell className="num text-xs">{formatDateShort(row.issueDate)}</TableCell>
      <TableCell className="num text-xs">{formatDateShort(row.dueDate)}</TableCell>
      <TableCell className="num text-right text-xs">{moneyCell(row.totalCents)}</TableCell>
      <TableCell className="num text-right text-xs">{moneyCell(row.paidCents)}</TableCell>
      <TableCell className="num text-right text-xs font-medium">
        {moneyCell(row.outstandingCents)}
      </TableCell>
      <TableCell className="num text-right text-xs">
        {row.daysOverdue > 0 ? `${row.daysOverdue}d` : "—"}
      </TableCell>
      <TableCell data-owed-state="">
        <BillingStateBadge state={row.state} overdueDays={row.daysOverdue} />
      </TableCell>
      <TableCell data-owed-pdf="">
        <InvoiceDocumentButton
          xeroInvoiceId={row.invoiceKey}
          invoiceNumber={row.invoiceNumber}
          available={row.pdfAvailable}
        />
      </TableCell>
      <TableCell data-owed-actions="" className="text-right">
        {overflow.length > 0 ? (
          <RowActionMenu
            items={overflow.map((item) => ({
              label: item.label,
              onSelect: () => {
                window.open(item.href, "_blank", "noopener,noreferrer")
              },
            }))}
          />
        ) : null}
      </TableCell>
    </TableRow>
  )
}
