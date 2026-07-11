"use client"

import { ChevronDown } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { ClientGroup } from "@/lib/finance/useReceivablesData"
import type { BillingRecord } from "@/lib/types/financeBilling"
import { clientInitials } from "@/lib/finance/cardHelpers"
import { formatAUD } from "@/lib/format/money"
import { BilledStatusPill } from "./BilledStatusPill"
import { ReceivableNotesButton } from "./ReceivableNotesButton"
import { ReceivablesMediaPlanSection } from "./ReceivablesMediaPlanSection"

type ReceivablesClientCardProps = {
  client: ClientGroup
  monthLabel: string
  refetch: () => void
  onToggleBilled: (rec: BillingRecord, nextBilled: boolean) => Promise<void>
  onNotesSaved?: (result: {
    invoice_key: string
    notes: string
    persisted_record_id: number
  }) => void
}

export function ReceivablesClientCard({
  client,
  monthLabel,
  refetch,
  onToggleBilled,
  onNotesSaved,
}: ReceivablesClientCardProps) {
  const invCount =
    client.mediaPlans.reduce((n, mp) => n + mp.records.length, 0) +
    client.scopeOfWorks.reduce((n, mp) => n + mp.records.length, 0) +
    client.retainers.length
  const invNoun = invCount === 1 ? "invoice" : "invoices"

  return (
    <Collapsible defaultOpen className="group/client">
      <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
        <CollapsibleTrigger asChild>
          <header className="flex w-full cursor-pointer items-center gap-3 border-b border-border bg-surface-panel px-4 py-3 text-left transition-colors hover:bg-table-row-hover">
            <Avatar className="h-9 w-9 rounded-pill border border-border shadow-e0">
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                {clientInitials(client.clientName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{client.clientName}</p>
              <p className="text-xs text-muted-foreground">
                {invCount} {invNoun} · {monthLabel}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Subtotal</p>
              <p className="num text-base font-semibold">{formatAUD(client.total)}</p>
            </div>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/client:-rotate-90"
              aria-hidden
            />
          </header>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 p-4">
            {client.mediaPlans.map((mp, mpIdx) => (
              <ReceivablesMediaPlanSection
                key={`mp-${client.clientsId}-${mpIdx}-${mp.mbaNumber}`}
                mp={mp}
                kind="media"
                sectionLabel={mpIdx === 0 && client.mediaPlans.length ? "Media plans" : undefined}
                refetch={refetch}
                onToggleBilled={onToggleBilled}
                onNotesSaved={onNotesSaved}
              />
            ))}
            {client.scopeOfWorks.map((mp, mpIdx) => (
              <ReceivablesMediaPlanSection
                key={`sow-${client.clientsId}-${mpIdx}-${mp.mbaNumber}`}
                mp={mp}
                kind="sow"
                sectionLabel="Fees"
                refetch={refetch}
                onToggleBilled={onToggleBilled}
                onNotesSaved={onNotesSaved}
              />
            ))}
            {client.retainers.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Retainers</p>
                {client.retainers.map((rec, recIdx) => (
                  <div
                    key={`ret-${client.clientsId}-${rec.id}-${recIdx}`}
                    className="flex items-center justify-between gap-2 rounded-input border border-border bg-surface-panel px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{rec.campaign_name || "Retainer"}</p>
                      {rec.invoice_date ? (
                        <p className="text-[11px] text-muted-foreground">{rec.invoice_date}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <BilledStatusPill
                        billed={rec.billed}
                        onToggle={(next) => onToggleBilled(rec, next)}
                        disabled={!rec.invoice_key}
                      />
                      <ReceivableNotesButton record={rec} onSaved={onNotesSaved} />
                      <p className="num text-sm font-semibold">{formatAUD(rec.total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
