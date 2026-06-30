"use client"

import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import type { MediaPlanGroup } from "@/lib/finance/useReceivablesData"
import { groupIdenticalLineItems } from "@/lib/finance/groupIdenticalLineItems"
import { formatAUD } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { MediaPlanActionBar } from "@/components/finance/MediaPlanActionBar"
import { BilledStatusPill } from "./BilledStatusPill"
import { ReceivablesLineGroupRow } from "./ReceivablesLineGroupRow"

type MediaTypeRollup = {
  mediaType: string
  total: number
  lineItems: BillingLineItem[]
}

function buildMediaTypeRollups(records: BillingRecord[]): MediaTypeRollup[] {
  const byType = new Map<string, BillingLineItem[]>()
  const order: string[] = []

  for (const rec of records) {
    for (const li of rec.line_items ?? []) {
      const key = (li.media_type ?? "").trim() || "Other"
      if (!byType.has(key)) {
        byType.set(key, [])
        order.push(key)
      }
      byType.get(key)!.push(li)
    }
  }

  return order.map((mediaType) => {
    const lineItems = byType.get(mediaType)!
    const total = Math.round(lineItems.reduce((s, li) => s + li.amount, 0) * 100) / 100
    return { mediaType, total, lineItems }
  })
}

type ReceivablesMediaPlanSectionProps = {
  mp: MediaPlanGroup
  kind: "media" | "sow"
  sectionLabel?: string
  refetch: () => void
  onToggleBilled: (rec: BillingRecord, nextBilled: boolean) => Promise<void>
}

function MediaTypeRollupRow({ rollup }: { rollup: MediaTypeRollup }) {
  const [open, setOpen] = useState(false)
  const grouped = useMemo(
    () =>
      groupIdenticalLineItems(
        [...rollup.lineItems].sort((a, b) => a.sort_order - b.sort_order)
      ),
    [rollup.lineItems]
  )

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-input px-2 py-2 text-left hover:bg-table-row-hover">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
            aria-hidden
          />
          <span className="truncate text-xs font-medium capitalize text-foreground">{rollup.mediaType}</span>
        </div>
        <span className="num shrink-0 text-xs font-medium">{formatAUD(rollup.total)}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mx-2 mb-2 rounded-input border border-border bg-background px-2">
          {grouped.map((g) => (
            <ReceivablesLineGroupRow key={g.key} group={g} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ReceivablesMediaPlanSection({
  mp,
  kind,
  sectionLabel,
  refetch,
  onToggleBilled,
}: ReceivablesMediaPlanSectionProps) {
  const rollups = useMemo(() => buildMediaTypeRollups(mp.records), [mp.records])

  return (
    <div className="space-y-2 border-b border-border/50 pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {sectionLabel ? (
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{sectionLabel}</p>
          ) : null}
          <p className="truncate text-sm font-medium">{mp.campaignName}</p>
          {mp.mbaNumber ? (
          <p className="num truncate text-[11px] text-muted-foreground">{mp.mbaNumber}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {kind === "media" ? (
            <MediaPlanActionBar
              mp={mp}
              billingMonth={mp.records[0]?.billing_month ?? ""}
              onSaved={refetch}
            />
          ) : null}
          <p className="num text-sm font-semibold">{formatAUD(mp.total)}</p>
        </div>
      </div>

      {mp.records.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <BilledStatusPill
            billed={mp.records[0]?.billed}
            onToggle={(next) => onToggleBilled(mp.records[0], next)}
            disabled={!mp.records[0]?.invoice_key}
          />
        </div>
      ) : null}

      {rollups.length === 0 ? (
        <p className="text-xs text-muted-foreground">No line items</p>
      ) : (
        <div className="space-y-0.5">
          {rollups.map((rollup) => (
            <MediaTypeRollupRow key={rollup.mediaType} rollup={rollup} />
          ))}
        </div>
      )}
    </div>
  )
}
