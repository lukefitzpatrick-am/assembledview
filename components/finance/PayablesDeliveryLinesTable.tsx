"use client"

import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { sumPayableLineItems } from "@/lib/finance/aggregatePayablesPublisherGroups"
import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"

function lineIsClientPaid(li: BillingLineItem): boolean {
  return li.client_pays_media === true || (li as { clientPaysForMedia?: boolean }).clientPaysForMedia === true
}

export function PayablesDeliveryLinesTable({
  record,
  hideClientPaidLines,
  tableIdPrefix,
}: {
  record: BillingRecord
  hideClientPaidLines: boolean
  /** Stable prefix for React keys (e.g. record id). */
  tableIdPrefix: string
}) {
  const items = useMemo(() => {
    let list = [...(record.line_items || [])].sort((a, b) => a.sort_order - b.sort_order)
    if (hideClientPaidLines) {
      list = list.filter((li) => !lineIsClientPaid(li))
    }
    return list
  }, [record.line_items, hideClientPaidLines])

  return (
    <div className="max-h-[240px] overflow-auto rounded border border-border/50">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[100px] text-xs">Code</TableHead>
            <TableHead className="text-xs">Media</TableHead>
            <TableHead className="text-xs">Publisher</TableHead>
            <TableHead className="text-xs">Description</TableHead>
            <TableHead className="w-[120px] text-right text-xs">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-xs text-muted-foreground">
                No line items
              </TableCell>
            </TableRow>
          ) : (
            items.map((item, idx) => {
              const isClientPaid = lineIsClientPaid(item)
              return (
                <TableRow
                  key={`${tableIdPrefix}-${idx}-${item.sort_order}-${item.item_code}`}
                  className={cn(isClientPaid && "opacity-60")}
                >
                  <TableCell className="p-1 text-xs">{item.item_code}</TableCell>
                  <TableCell className="p-1 text-xs">{item.media_type ?? "—"}</TableCell>
                  <TableCell className="p-1 text-xs">{item.publisher_name ?? "—"}</TableCell>
                  <TableCell className="p-1 text-xs">
                    <div className="flex flex-wrap items-center gap-1">
                      {isClientPaid ? (
                        <Badge className="bg-muted text-muted-foreground text-[10px] font-normal hover:bg-muted">
                          Client paid direct
                        </Badge>
                      ) : null}
                      <span>{item.description ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="p-1 text-right text-xs tabular-nums">
                    {isClientPaid ? (
                      <span className="line-through tabular-nums">{formatMoney(item.amount)}</span>
                    ) : (
                      formatMoney(item.amount)
                    )}
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export function PayablesAgencyOwedFooter({ record }: { record: BillingRecord }) {
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      Agency-owed sum: {formatMoney(sumPayableLineItems(record))}
    </p>
  )
}
