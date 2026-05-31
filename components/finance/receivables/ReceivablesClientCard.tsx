"use client"

import { ChevronDown } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { ClientGroup } from "@/lib/finance/useReceivablesData"
import type { BillingRecord } from "@/lib/types/financeBilling"
import { clientAccentColour, clientInitials } from "@/lib/finance/cardHelpers"
import { formatMoney } from "@/lib/format/money"
import { BilledStatusPill } from "./BilledStatusPill"
import { ReceivablesMediaPlanSection } from "./ReceivablesMediaPlanSection"

type ReceivablesClientCardProps = {
  client: ClientGroup
  monthLabel: string
  onToggleBilled: (rec: BillingRecord, nextBilled: boolean) => Promise<void>
}

export function ReceivablesClientCard({ client, monthLabel, onToggleBilled }: ReceivablesClientCardProps) {
  const invCount =
    client.mediaPlans.reduce((n, mp) => n + mp.records.length, 0) +
    client.scopeOfWorks.reduce((n, mp) => n + mp.records.length, 0) +
    client.retainers.length
  const invNoun = invCount === 1 ? "invoice" : "invoices"
  const accent = clientAccentColour(client.clientsId)

  return (
    <Collapsible defaultOpen className="group/client">
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        <CollapsibleTrigger asChild>
          <header className="flex w-full cursor-pointer items-center gap-3 border-b border-border/60 bg-muted/40 px-4 py-3 text-left transition-colors hover:bg-muted/55">
            <Avatar className="h-9 w-9 rounded-full border border-border/40 shadow-sm">
              <AvatarFallback className="text-xs font-semibold text-white" style={{ backgroundColor: accent }}>
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
              <p className="text-base font-semibold tabular-nums">{formatMoney(client.total)}</p>
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
                sectionLabel={mpIdx === 0 && client.mediaPlans.length ? "Media plans" : undefined}
                onToggleBilled={onToggleBilled}
              />
            ))}
            {client.scopeOfWorks.map((mp, mpIdx) => (
              <ReceivablesMediaPlanSection
                key={`sow-${client.clientsId}-${mpIdx}-${mp.mbaNumber}`}
                mp={mp}
                sectionLabel="Fees"
                onToggleBilled={onToggleBilled}
              />
            ))}
            {client.retainers.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Retainers</p>
                {client.retainers.map((rec, recIdx) => (
                  <div
                    key={`ret-${client.clientsId}-${rec.id}-${recIdx}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2"
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
                      <p className="text-sm font-semibold tabular-nums">{formatMoney(rec.total)}</p>
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
