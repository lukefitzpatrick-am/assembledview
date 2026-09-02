"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { InXeroMatchRow } from "@/components/finance/sections/inXero/InXeroMatchRow"
import {
  type DraftMatchApproved,
  type DraftMatchGrouped,
  type DraftMatchOutcome,
  type DraftMatchReport,
  type DraftMatchRow,
} from "@/lib/finance/sections/draftMatch"
import {
  IN_XERO_CLIENT_GRID_CLASS,
  groupDraftMatchRowsByClient,
  isDraftMatchOutcomeCollapsedByDefault,
  visibleDraftMatchOutcomes,
} from "@/lib/finance/sections/inXeroPresentation"

type AssignMaps = {
  assignClient: Record<string, string>
  assignMba: Record<string, string>
  assignKey: Record<string, string>
  setAssignClient: Dispatch<SetStateAction<Record<string, string>>>
  setAssignMba: Dispatch<SetStateAction<Record<string, string>>>
  setAssignKey: Dispatch<SetStateAction<Record<string, string>>>
}

export function InXeroOutcomeList({
  grouped,
  candidates,
  mbaOptions,
  busyId,
  assign,
  onAccept,
  onAssign,
}: {
  grouped: DraftMatchGrouped
  candidates: DraftMatchApproved[]
  mbaOptions: DraftMatchReport["mbaOptions"]
  busyId: string | null
  assign: AssignMaps
  onAccept: (row: DraftMatchRow) => void
  onAssign: (row: DraftMatchRow, key: string) => void
}) {
  const outcomes = visibleDraftMatchOutcomes(grouped)
  return (
    <div data-in-xero-outcomes="" className="space-y-6">
      {outcomes.map((outcome) => (
        <InXeroOutcomeSection
          key={outcome}
          outcome={outcome}
          rows={grouped[outcome]}
          candidates={candidates}
          mbaOptions={mbaOptions}
          busyId={busyId}
          assign={assign}
          onAccept={onAccept}
          onAssign={onAssign}
        />
      ))}
    </div>
  )
}

function InXeroOutcomeSection({
  outcome,
  rows,
  candidates,
  mbaOptions,
  busyId,
  assign,
  onAccept,
  onAssign,
}: {
  outcome: DraftMatchOutcome
  rows: DraftMatchRow[]
  candidates: DraftMatchApproved[]
  mbaOptions: DraftMatchReport["mbaOptions"]
  busyId: string | null
  assign: AssignMaps
  onAccept: (row: DraftMatchRow) => void
  onAssign: (row: DraftMatchRow, key: string) => void
}) {
  const collapsedDefault = isDraftMatchOutcomeCollapsedByDefault(outcome)
  const [open, setOpen] = useState(!collapsedDefault)
  const cards = groupDraftMatchRowsByClient(rows)

  const heading = (
    <h2 className="text-sm font-semibold text-foreground">
      {outcome}
      <span className="ml-2 font-normal text-muted-foreground">{rows.length}</span>
    </h2>
  )

  const grid = (
    <div data-in-xero-client-grid="" className={IN_XERO_CLIENT_GRID_CLASS}>
      {cards.map((card) => (
        <article
          key={card.clientKey}
          data-in-xero-client-card=""
          className="rounded-card border border-border bg-card shadow-e1"
        >
          <header className="flex items-start justify-between gap-3 border-b border-border bg-surface-panel px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{card.clientName}</p>
              <p className="text-xs text-muted-foreground">
                {card.rows.length} {card.rows.length === 1 ? "invoice" : "invoices"}
              </p>
            </div>
          </header>
          <div className="px-4 py-2">
            {card.rows.map((row) => (
              <InXeroMatchRow
                key={row.id}
                row={row}
                candidates={candidates}
                mbaOptions={mbaOptions}
                busy={busyId === row.id}
                assignClient={assign.assignClient[row.id]}
                assignMba={assign.assignMba[row.id]}
                assignKey={assign.assignKey[row.id]}
                setAssignClient={(v) =>
                  assign.setAssignClient((p) => ({ ...p, [row.id]: v }))
                }
                setAssignMba={(v) => assign.setAssignMba((p) => ({ ...p, [row.id]: v }))}
                setAssignKey={(v) => assign.setAssignKey((p) => ({ ...p, [row.id]: v }))}
                onAccept={() => onAccept(row)}
                onAssign={(key) => onAssign(row, key)}
              />
            ))}
          </div>
        </article>
      ))}
    </div>
  )

  if (!collapsedDefault) {
    return (
      <section data-outcome-section={outcome} data-collapsed="false" className="space-y-2">
        {heading}
        {grid}
      </section>
    )
  }

  return (
    <section data-outcome-section={outcome} data-collapsed={open ? "false" : "true"}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between">
          {heading}
          <CollapsibleTrigger asChild>
            <Button type="button" size="sm" variant="ghost">
              {open ? "Hide" : "Show"}
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-2">{grid}</CollapsibleContent>
      </Collapsible>
    </section>
  )
}
