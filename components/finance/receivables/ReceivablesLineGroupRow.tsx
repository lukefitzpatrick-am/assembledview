"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { InlineScheduleAmountCell } from "@/components/finance/receivables/InlineScheduleAmountCell"
import type { InlineScheduleEditContext } from "@/lib/finance/commitInlineScheduleAmountEdit"
import { formatLineItemDescription } from "@/lib/finance/lineItemDescription"
import type { GroupedLineItem } from "@/lib/finance/groupIdenticalLineItems"
import type { BillingLineItem } from "@/lib/types/financeBilling"
import { formatAUD } from "@/lib/format/money"
import { cn } from "@/lib/utils"

type ReceivablesLineGroupRowProps = {
  group: GroupedLineItem
  editCtx?: InlineScheduleEditContext | null
  onLineAmountCommitted?: (
    line: BillingLineItem,
    next: { amount: number; billing_mode?: "auto" | "manual" | null }
  ) => void
}

function LineAmountCell({
  line,
  editCtx,
  onLineAmountCommitted,
}: {
  line: BillingLineItem
  editCtx?: InlineScheduleEditContext | null
  onLineAmountCommitted?: ReceivablesLineGroupRowProps["onLineAmountCommitted"]
}) {
  return (
    <InlineScheduleAmountCell
      line={line}
      ctx={editCtx ?? null}
      onCommitted={(next) => onLineAmountCommitted?.(line, next)}
    />
  )
}

export function ReceivablesLineGroupRow({
  group,
  editCtx,
  onLineAmountCommitted,
}: ReceivablesLineGroupRowProps) {
  const [open, setOpen] = useState(false)
  const publisher = (group.publisher_name ?? "").trim() || "—"
  const description = (group.description ?? "").trim() || "—"

  if (group.count === 1) {
    const li = group.items[0]
    const { primary, channelLabel } = formatLineItemDescription(li)
    return (
      <div className="flex items-start justify-between gap-3 border-b border-border/40 py-2 last:border-0">
        <div className="min-w-0">
          <p className="truncate text-xs text-foreground">{primary}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{channelLabel}</p>
        </div>
        <LineAmountCell
          line={li}
          editCtx={editCtx}
          onLineAmountCommitted={onLineAmountCommitted}
        />
      </div>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 border-b border-border py-2 text-left last:border-0 hover:bg-table-row-hover">
        <div className="min-w-0 flex-1">
          <p className="num truncate text-xs text-foreground">
            {publisher} · {description} · ×{group.count} · {formatAUD(group.total)}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {open ? "Hide breakdown" : "Show breakdown"}
          </p>
        </div>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-b border-border bg-surface-panel px-2 pb-1">
          {group.items.map((li, liIdx) => {
            const { primary, channelLabel } = formatLineItemDescription(li)
            return (
              <div
                key={`${group.key}-${liIdx}-${li.sort_order}-${li.schedule_line_item_id ?? li.item_code}`}
                className="flex items-start justify-between gap-3 border-b border-border py-1.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-foreground">{primary}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{channelLabel}</p>
                </div>
                <LineAmountCell
                  line={li}
                  editCtx={editCtx}
                  onLineAmountCommitted={onLineAmountCommitted}
                />
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
