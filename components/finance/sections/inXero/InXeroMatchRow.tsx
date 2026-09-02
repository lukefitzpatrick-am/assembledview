"use client"

import { useMemo, useState, type ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RowActionLine } from "@/components/finance/RowActionLine"
import type { RowActionMenuItem } from "@/components/finance/RowActionMenu"
import {
  type DraftMatchApproved,
  type DraftMatchReport,
  type DraftMatchRow,
} from "@/lib/finance/sections/draftMatch"
import {
  inXeroPrimaryAction,
  inXeroPrimaryLabel,
} from "@/lib/finance/sections/inXeroPresentation"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"

const OUTCOME_BADGE: Record<
  DraftMatchRow["outcome"],
  "critical" | "behind" | "attention" | "success"
> = {
  Differs: "critical",
  Missing: "behind",
  Extra: "attention",
  Agrees: "success",
}

function moneyCell(cents: number): string {
  return formatMoney(cents / 100)
}

function deltaClass(cents: number): string {
  if (cents === 0) return "text-muted-foreground"
  if (cents > 0) return "text-status-behind-fg"
  return "text-status-critical-fg"
}

export function InXeroMatchRow({
  row,
  candidates,
  mbaOptions,
  busy,
  assignClient,
  assignMba,
  assignKey,
  setAssignClient,
  setAssignMba,
  setAssignKey,
  onAccept,
  onAssign,
}: {
  row: DraftMatchRow
  candidates: DraftMatchApproved[]
  mbaOptions: DraftMatchReport["mbaOptions"]
  busy: boolean
  assignClient?: string
  assignMba?: string
  assignKey?: string
  setAssignClient: (v: string) => void
  setAssignMba: (v: string) => void
  setAssignKey: (v: string) => void
  onAccept: () => void
  onAssign: (invoiceKey: string) => void
}) {
  const [assignOpen, setAssignOpen] = useState(false)
  const clientId = assignClient || (row.clients_id != null ? String(row.clients_id) : "")
  const clientMbas = useMemo(
    () =>
      clientId
        ? mbaOptions.filter((m) => m.client_id != null && String(m.client_id) === clientId)
        : [],
    [mbaOptions, clientId]
  )
  const mba = assignMba ?? ""
  const filteredKeys = candidates.filter((c) => {
    if (clientId && String(c.clients_id) !== clientId) return false
    if (mba && (c.mba_number ?? "") !== mba) return false
    if (row.billing_month && c.billing_month !== row.billing_month) return false
    return true
  })
  const clients = useMemo(() => {
    const map = new Map<number, string>()
    for (const c of candidates) {
      if (!map.has(c.clients_id)) map.set(c.clients_id, c.client_name)
    }
    if (row.clients_id != null && row.client_name) map.set(row.clients_id, row.client_name)
    return [...map.entries()].toSorted((a, b) => a[1].localeCompare(b[1]))
  }, [candidates, row.clients_id, row.client_name])

  const canAccept =
    row.outcome === "Differs" && row.approved.length === 1 && row.drafts.length === 1
  const canAssign = row.outcome === "Extra" || row.outcome === "Differs"
  const primaryKind = inXeroPrimaryAction(row.outcome)
  const mbaMeta = row.approved[0]?.mba_number || row.drafts[0]?.reference_raw || ""

  let primary: ReactNode = null
  if (primaryKind === "accept") {
    primary = (
      <Button
        type="button"
        size="sm"
        disabled={busy || !canAccept}
        title={
          canAccept
            ? undefined
            : "Need a single approved invoice and a single Xero draft"
        }
        onClick={onAccept}
      >
        {inXeroPrimaryLabel("accept")}
      </Button>
    )
  } else if (primaryKind === "assign") {
    primary = (
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={() => setAssignOpen((open) => !open)}
      >
        {inXeroPrimaryLabel("assign")}
      </Button>
    )
  }

  const menuItems: RowActionMenuItem[] = []
  if (row.drafts.length === 0) {
    menuItems.push({
      label: "No Xero draft",
      disabled: true,
      disabledReason: "Approved here with nothing keyed in Xero",
      onSelect: () => undefined,
    })
  }
  for (const d of row.drafts) {
    if (d.xero_url) {
      menuItems.push({
        label: `Open ${d.invoice_number || "draft"} in Xero`,
        onSelect: () => {
          window.open(d.xero_url!, "_blank", "noopener,noreferrer")
        },
      })
    } else {
      menuItems.push({
        label: `Search in Xero: ${d.invoice_number || d.xero_invoice_id}`,
        disabled: true,
        disabledReason: "No Xero URL on this draft — search by invoice number",
        onSelect: () => undefined,
      })
    }
  }
  if (row.outcome === "Differs" && canAssign) {
    menuItems.push({
      label: "Assign",
      disabled: busy,
      onSelect: () => setAssignOpen(true),
    })
  }

  const showAssign = canAssign && assignOpen

  return (
    <div
      data-in-xero-row=""
      data-outcome={row.outcome}
      className="space-y-1.5 border-b border-border/50 py-3 last:border-0 last:pb-0 first:pt-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="num truncate text-sm font-medium text-foreground">
            {row.billing_month || "—"}
          </p>
          {mbaMeta ? (
            <p className="num truncate text-[11px] text-muted-foreground">{mbaMeta}</p>
          ) : null}
          {row.drafts.length > 1 ? (
            <p className="text-[11px] text-muted-foreground">{row.drafts.length} drafts</p>
          ) : null}
        </div>
        <div className="shrink-0 space-y-0.5 text-right">
          <p className="num text-xs text-muted-foreground">
            Approved {moneyCell(row.approved_amount_cents)}
          </p>
          <p className="num text-xs text-muted-foreground">
            Xero {moneyCell(row.xero_amount_cents)}
          </p>
          <p className={cn("num text-xs font-medium", deltaClass(row.delta_cents))}>
            Delta {moneyCell(row.delta_cents)}
          </p>
        </div>
      </div>

      <RowActionLine
        pill={
          <Badge variant={OUTCOME_BADGE[row.outcome]} size="sm">
            {row.outcome}
          </Badge>
        }
        primary={primary}
        menuItems={menuItems}
      />

      {showAssign ? (
        <div className="flex flex-col gap-1.5 pt-1" data-in-xero-assign="">
          <Select
            disabled={busy}
            value={clientId || undefined}
            onValueChange={(v) => {
              setAssignClient(v)
              setAssignMba("")
              setAssignKey("")
            }}
          >
            <SelectTrigger className="h-8 w-full max-w-[14rem] text-xs">
              <SelectValue placeholder="Assign client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(([id, name]) => (
                <SelectItem key={id} value={String(id)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {clientId ? (
            <Select
              disabled={busy || clientMbas.length === 0}
              value={mba || undefined}
              onValueChange={(v) => {
                setAssignMba(v)
                setAssignKey("")
              }}
            >
              <SelectTrigger className="h-8 w-full max-w-[14rem] text-xs">
                <SelectValue placeholder="Assign MBA" />
              </SelectTrigger>
              <SelectContent>
                {clientMbas.map((m) => (
                  <SelectItem key={m.mba_number} value={m.mba_number}>
                    {m.campaign_name.trim()
                      ? `${m.mba_number} · ${m.campaign_name}`
                      : m.mba_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {filteredKeys.length > 0 ? (
            <Select
              disabled={busy}
              value={assignKey || undefined}
              onValueChange={(v) => {
                setAssignKey(v)
                onAssign(v)
              }}
            >
              <SelectTrigger className="h-8 w-full max-w-[14rem] text-xs">
                <SelectValue placeholder="Match to approved" />
              </SelectTrigger>
              <SelectContent>
                {filteredKeys.map((c) => (
                  <SelectItem key={c.invoice_key} value={c.invoice_key}>
                    {c.invoice_key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
