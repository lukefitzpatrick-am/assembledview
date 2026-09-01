"use client"

/**
 * COPY of `ReceivablesMediaPlanSection` for the invoicing section — adds
 * display-only "Invoiced vs booked" (billed_amount overlay). Do not edit the original.
 */

import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { BillingLineItem, BillingRecord } from "@/lib/types/financeBilling"
import type { MediaPlanGroup } from "@/lib/finance/useReceivablesData"
import type { InlineScheduleEditContext } from "@/lib/finance/commitInlineScheduleAmountEdit"
import { groupIdenticalLineItems } from "@/lib/finance/groupIdenticalLineItems"
import { formatAUD } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { MediaPlanActionBar } from "@/components/finance/MediaPlanActionBar"
import { BillingStateBadge } from "@/components/finance/BillingStateBadge"
import { ReceivableNotesButton } from "@/components/finance/receivables/ReceivableNotesButton"
import { ReceivablesLineGroupRow } from "@/components/finance/receivables/ReceivablesLineGroupRow"
import { formatInvoicedVsBookedForRecords } from "@/components/finance/sections/invoicing/invoicedVsBooked"
import { hasBillingEvidence } from "@/lib/finance/billingLifecycle"

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

type InvoicingMediaPlanSectionProps = {
  mp: MediaPlanGroup
  kind: "media" | "sow"
  sectionLabel?: string
  refetch: () => void
  onNotesSaved?: (result: {
    invoice_key: string
    notes: string
    persisted_record_id: number
  }) => void
  onLineAmountCommitted?: (
    line: BillingLineItem,
    next: { amount: number; billing_mode?: "auto" | "manual" | null },
    ctx: InlineScheduleEditContext
  ) => void
}

function MediaTypeRollupRow({
  rollup,
  editCtx,
  invoiceBilled,
  confirmIfAnyBilled,
  onLineAmountCommitted,
}: {
  rollup: MediaTypeRollup
  editCtx: InlineScheduleEditContext | null
  invoiceBilled?: boolean
  confirmIfAnyBilled?: boolean
  onLineAmountCommitted?: InvoicingMediaPlanSectionProps["onLineAmountCommitted"]
}) {
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
          <span className="truncate text-xs font-medium capitalize text-foreground">
            {rollup.mediaType}
          </span>
        </div>
        <span className="num shrink-0 text-xs font-medium">{formatAUD(rollup.total)}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mx-2 mb-2 rounded-input border border-border bg-background px-2">
          {grouped.map((g) => (
            <ReceivablesLineGroupRow
              key={g.key}
              group={g}
              editCtx={editCtx}
              invoiceBilled={invoiceBilled}
              confirmIfAnyBilled={confirmIfAnyBilled}
              onLineAmountCommitted={(line, next) => {
                if (!editCtx) return
                onLineAmountCommitted?.(line, next, editCtx)
              }}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function InvoicingMediaPlanSection({
  mp,
  kind,
  sectionLabel,
  refetch,
  onNotesSaved,
  onLineAmountCommitted,
}: InvoicingMediaPlanSectionProps) {
  const rollups = useMemo(() => buildMediaTypeRollups(mp.records), [mp.records])
  const invoicedVsBooked = useMemo(
    () => formatInvoicedVsBookedForRecords(mp.records),
    [mp.records]
  )

  const editCtx = useMemo<InlineScheduleEditContext | null>(() => {
    if (kind !== "media") return null
    if (!mp.mbaNumber || mp.versionId == null || mp.versionNumber == null) return null
    const billingMonthIso = mp.records[0]?.billing_month ?? ""
    if (!billingMonthIso) return null
    return {
      versionId: mp.versionId,
      versionNumber: mp.versionNumber,
      mbaNumber: mp.mbaNumber,
      billingMonthIso,
    }
  }, [kind, mp.mbaNumber, mp.versionId, mp.versionNumber, mp.records])

  return (
    <div className="space-y-2 border-b border-border/50 pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {sectionLabel ? (
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {sectionLabel}
            </p>
          ) : null}
          <p className="truncate text-sm font-medium">{mp.campaignName}</p>
          {mp.mbaNumber ? (
            <p className="num truncate text-[11px] text-muted-foreground">{mp.mbaNumber}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {kind === "media" ? (
              <MediaPlanActionBar
                mp={mp}
                billingMonth={mp.records[0]?.billing_month ?? ""}
                onSaved={refetch}
              />
            ) : null}
            <p className="num text-sm font-semibold">{formatAUD(mp.total)}</p>
          </div>
          <p className="num text-[11px] text-muted-foreground" title="Invoiced (billed_amount) vs booked">
            Invoiced vs booked: {invoicedVsBooked}
          </p>
        </div>
      </div>

      {mp.records.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <BillingStateBadge
            state={mp.records[0]?.state ?? "ready"}
            reason={mp.records[0]?.state_reason}
          />
          <ReceivableNotesButton record={mp.records[0]} onSaved={onNotesSaved} />
        </div>
      ) : null}

      {rollups.length === 0 ? (
        <p className="text-xs text-muted-foreground">No line items</p>
      ) : (
        <div className="space-y-0.5">
          {rollups.map((rollup) => (
            <MediaTypeRollupRow
              key={rollup.mediaType}
              rollup={rollup}
              editCtx={editCtx}
              invoiceBilled={hasBillingEvidence(mp.records[0]?.state)}
              confirmIfAnyBilled={mp.records.some((r) => hasBillingEvidence(r.state))}
              onLineAmountCommitted={onLineAmountCommitted}
            />
          ))}
        </div>
      )}
    </div>
  )
}
