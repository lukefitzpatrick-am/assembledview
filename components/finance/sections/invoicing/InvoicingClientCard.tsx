"use client"

/**
 * One card per client: header + one InvoicingPlanRow per record.
 */

import type { BillingLineItem } from "@/lib/types/financeBilling"
import type { ClientGroup } from "@/lib/finance/useReceivablesData"
import type { InlineScheduleEditContext } from "@/lib/finance/commitInlineScheduleAmountEdit"
import type { InvoicingClientBlockerMeta } from "@/lib/finance/sections/invoicingRowPresentation"
import { formatAUD } from "@/lib/format/money"
import { InvoicingMediaPlanSection } from "@/components/finance/sections/invoicing/InvoicingMediaPlanSection"
import { InvoicingPlanRow } from "@/components/finance/sections/invoicing/InvoicingPlanRow"

type InvoicingClientCardProps = {
  client: ClientGroup
  monthLabel: string
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
  clientMeta?: InvoicingClientBlockerMeta | null
}

export function InvoicingClientCard({
  client,
  monthLabel,
  refetch,
  onNotesSaved,
  onLineAmountCommitted,
  clientMeta,
}: InvoicingClientCardProps) {
  const invCount =
    client.mediaPlans.reduce((n, mp) => n + mp.records.length, 0) +
    client.scopeOfWorks.reduce((n, mp) => n + mp.records.length, 0) +
    client.retainers.length
  const invNoun = invCount === 1 ? "invoice" : "invoices"

  return (
    <article
      data-invoicing-client-card=""
      className="rounded-card border border-border bg-card shadow-e1"
      aria-label={`${client.clientName}, ${invCount} ${invNoun}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border bg-surface-panel px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{client.clientName}</p>
          <p className="text-xs text-muted-foreground">
            {invCount} {invNoun}
            <span className="sr-only"> {monthLabel}</span>
          </p>
        </div>
        <p className="num shrink-0 text-sm font-semibold tabular-nums">{formatAUD(client.total)}</p>
      </header>
      <div className="px-4 py-2">
        {client.mediaPlans.map((mp, mpIdx) => (
          <InvoicingMediaPlanSection
            key={`mp-${client.clientsId}-${mpIdx}-${mp.mbaNumber}`}
            mp={mp}
            kind="media"
            refetch={refetch}
            onNotesSaved={onNotesSaved}
            onLineAmountCommitted={onLineAmountCommitted}
            clientMeta={clientMeta}
          />
        ))}
        {client.scopeOfWorks.map((mp, mpIdx) => (
          <InvoicingMediaPlanSection
            key={`sow-${client.clientsId}-${mpIdx}-${mp.mbaNumber}`}
            mp={mp}
            kind="sow"
            refetch={refetch}
            onNotesSaved={onNotesSaved}
            onLineAmountCommitted={onLineAmountCommitted}
            clientMeta={clientMeta}
          />
        ))}
        {client.retainers.map((record, recIdx) => (
          <InvoicingPlanRow
            key={record.invoice_key ?? `ret-${client.clientsId}-${recIdx}-${record.id}`}
            record={record}
            kind="retainer"
            refetch={refetch}
            onNotesSaved={onNotesSaved}
            clientMeta={clientMeta}
          />
        ))}
      </div>
    </article>
  )
}
