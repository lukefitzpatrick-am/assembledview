"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { formatLineItemDescription } from "@/lib/finance/lineItemDescription"
import type { GroupedLineItem } from "@/lib/finance/groupIdenticalLineItems"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"

type ReceivablesLineGroupRowProps = {
  group: GroupedLineItem
}

export function ReceivablesLineGroupRow({ group }: ReceivablesLineGroupRowProps) {
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
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatMoney(li.amount)}</p>
      </div>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 border-b border-border/40 py-2 text-left last:border-0 hover:bg-muted/30">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-foreground">
            {publisher} · {description} · ×{group.count} · {formatMoney(group.total)}
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
        <div className="border-b border-border/40 bg-muted/20 px-2 pb-1">
          {group.items.map((li, liIdx) => {
            const { primary, channelLabel } = formatLineItemDescription(li)
            return (
              <div
                key={`${group.key}-${liIdx}-${li.sort_order}`}
                className="flex items-start justify-between gap-3 border-b border-border/30 py-1.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-foreground">{primary}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{channelLabel}</p>
                </div>
                <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{formatMoney(li.amount)}</p>
              </div>
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
