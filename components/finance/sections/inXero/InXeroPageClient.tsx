"use client"

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { Download, ExternalLink, RefreshCw } from "lucide-react"
import { FinanceSectionsShell } from "@/components/finance/sections/FinanceSectionsShell"
import { SectionScopeBar } from "@/components/finance/sections/SectionScopeBar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import { fetchFinanceSectionsJson } from "@/lib/finance/sections/api"
import {
  type DraftMatchApproved,
  type DraftMatchOutcome,
  type DraftMatchReport,
  type DraftMatchRow,
} from "@/lib/finance/sections/draftMatch"
import { exportDraftMatchExcel } from "@/lib/finance/sections/exportDraftMatch"
import {
  useFinanceScopeApplied,
  useFinanceScopeVersion,
} from "@/lib/finance/sections/useFinanceScope"
import { formatMoney } from "@/lib/format/money"
import type { ViewState } from "@/lib/ui/viewState"
import { cn } from "@/lib/utils"

const OUTCOME_ORDER: DraftMatchOutcome[] = ["Differs", "Missing", "Extra", "Agrees"]

const OUTCOME_BADGE: Record<
  DraftMatchOutcome,
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

function formatPulled(iso: string | null): string {
  if (!iso) return "Never pulled"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "Never pulled"
  return d.toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function deltaClass(cents: number): string {
  if (cents === 0) return "text-muted-foreground"
  if (cents > 0) return "text-status-behind-fg"
  return "text-status-critical-fg"
}

export function InXeroPageClient() {
  const { toast } = useToast()
  const applied = useFinanceScopeApplied()
  const scopeVersion = useFinanceScopeVersion()
  const [view, setView] = useState<ViewState<DraftMatchReport>>({ status: "loading" })
  const [updating, setUpdating] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [assignClient, setAssignClient] = useState<Record<string, string>>({})
  const [assignMba, setAssignMba] = useState<Record<string, string>>({})
  const [assignKey, setAssignKey] = useState<Record<string, string>>({})
  const [agreesOpen, setAgreesOpen] = useState(false)

  const load = useCallback(() => {
    setView((prev) => {
      if (prev.status === "ready") return prev
      return { status: "loading" }
    })
    setUpdating(true)
    const params: Record<string, string | number | undefined | null> = {}
    if (applied.clients.length > 0) params.clients = applied.clients.join(",")
    void fetchFinanceSectionsJson<DraftMatchReport>(
      "/api/finance/sections/draft-match",
      params,
      { retry: () => load() }
    ).then((next) => {
      setUpdating(false)
      setView(next)
    })
  }, [applied.clients])

  useEffect(() => {
    load()
  }, [load, scopeVersion])

  const payload = view.status === "ready" ? view.data : null
  const exceptionCount = payload
    ? payload.counts.Differs + payload.counts.Missing + payload.counts.Extra
    : 0

  const onPull = async () => {
    setPulling(true)
    try {
      const res = await fetch("/api/finance/sections/pull-xero", { method: "POST" })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        retry_after_seconds?: number
        ok?: boolean
      }
      if (res.status === 429) {
        const secs = body.retry_after_seconds ?? 60
        toast({
          variant: "destructive",
          title: "Pull already running",
          description: `Try again in ${secs}s.`,
        })
        return
      }
      if (!res.ok) {
        throw new Error(body.error || `Pull failed (${res.status})`)
      }
      toast({ title: "Pulled from Xero", description: "Drafts refreshed. Matching again." })
      load()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Pull failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setPulling(false)
    }
  }

  const onExport = async () => {
    if (!payload) return
    setExporting(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      await exportDraftMatchExcel(payload, `xero-draft-match-${stamp}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  const mutate = async (row: DraftMatchRow, action: "accept" | "assign", invoiceKey: string) => {
    const xeroId = row.drafts[0]?.xero_invoice_id
    if (!xeroId || !invoiceKey) return
    setBusyId(row.id)
    try {
      const res = await fetch("/api/finance/sections/draft-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          invoice_key: invoiceKey,
          xero_invoice_id: xeroId,
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        throw new Error(err.message || err.error || `Request failed (${res.status})`)
      }
      toast({
        title: action === "accept" ? "Xero figure recorded" : "Assigned",
        description:
          action === "accept"
            ? "Match saved. The approved snapshot is unchanged — the delta stays visible."
            : "Manual match saved.",
      })
      load()
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Match failed",
        description: e instanceof Error ? e.message : "Unknown error",
      })
    } finally {
      setBusyId(null)
    }
  }

  const showingLabel = payload
    ? `${exceptionCount} exception${exceptionCount === 1 ? "" : "s"} · ${payload.counts.Agrees} agree`
    : "Xero drafts vs approved invoices"

  const dimmed = updating && view.status === "ready"

  return (
    <FinanceSectionsShell
      title="In Xero"
      scopeBar={<SectionScopeBar showingLabel={showingLabel} />}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Match Xero drafts to approved invoices before anyone authorises in Xero. This app
            never writes to Xero.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Last pulled {formatPulled(payload?.lastPulledAt ?? null)}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onPull()}
              disabled={pulling}
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", pulling && "animate-spin")} />
              Pull from Xero
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onExport()}
              disabled={!payload || exporting}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Excel
            </Button>
          </div>
        </div>

        {view.status === "loading" && !payload ? <LoadingState rows={8} /> : null}
        {view.status === "error" ? (
          <ErrorState message={view.message} onRetry={view.retry} />
        ) : null}
        {view.status === "ready" && payload && exceptionCount === 0 && payload.counts.Agrees === 0 ? (
          <EmptyState
            title="No drafts to match"
            message="Pull from Xero after finance has finished keying drafts. There are no approved invoices waiting, and no live drafts in the last pull."
          />
        ) : null}

        {payload ? (
          <div className={cn("space-y-6", dimmed && "opacity-70")}>
            {OUTCOME_ORDER.filter((o) => o !== "Agrees").map((outcome) => (
              <OutcomeTable
                key={outcome}
                outcome={outcome}
                rows={payload.grouped[outcome]}
                candidates={payload.approvedCandidates}
                mbaOptions={payload.mbaOptions}
                busyId={busyId}
                assignClient={assignClient}
                assignMba={assignMba}
                assignKey={assignKey}
                setAssignClient={setAssignClient}
                setAssignMba={setAssignMba}
                setAssignKey={setAssignKey}
                onAccept={(row) => void mutate(row, "accept", row.approved[0]?.invoice_key ?? "")}
                onAssign={(row, key) => void mutate(row, "assign", key)}
              />
            ))}
            <Collapsible open={agreesOpen} onOpenChange={setAgreesOpen}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  Agrees
                  <span className="ml-2 font-normal text-muted-foreground">
                    {payload.counts.Agrees}
                  </span>
                </h2>
                <CollapsibleTrigger asChild>
                  <Button type="button" size="sm" variant="ghost">
                    {agreesOpen ? "Hide" : "Show"}
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <OutcomeTable
                  outcome="Agrees"
                  rows={payload.grouped.Agrees}
                  candidates={payload.approvedCandidates}
                  mbaOptions={payload.mbaOptions}
                  busyId={busyId}
                  assignClient={assignClient}
                  assignMba={assignMba}
                  assignKey={assignKey}
                  setAssignClient={setAssignClient}
                  setAssignMba={setAssignMba}
                  setAssignKey={setAssignKey}
                  onAccept={(row) => void mutate(row, "accept", row.approved[0]?.invoice_key ?? "")}
                  onAssign={(row, key) => void mutate(row, "assign", key)}
                />
              </CollapsibleContent>
            </Collapsible>
          </div>
        ) : null}
      </div>
    </FinanceSectionsShell>
  )
}

function OutcomeTable({
  outcome,
  rows,
  candidates,
  mbaOptions,
  busyId,
  assignClient,
  assignMba,
  assignKey,
  setAssignClient,
  setAssignMba,
  setAssignKey,
  onAccept,
  onAssign,
}: {
  outcome: DraftMatchOutcome
  rows: DraftMatchRow[]
  candidates: DraftMatchApproved[]
  mbaOptions: DraftMatchReport["mbaOptions"]
  busyId: string | null
  assignClient: Record<string, string>
  assignMba: Record<string, string>
  assignKey: Record<string, string>
  setAssignClient: Dispatch<SetStateAction<Record<string, string>>>
  setAssignMba: Dispatch<SetStateAction<Record<string, string>>>
  setAssignKey: Dispatch<SetStateAction<Record<string, string>>>
  onAccept: (row: DraftMatchRow) => void
  onAssign: (row: DraftMatchRow, invoiceKey: string) => void
}) {
  if (rows.length === 0) return null
  return (
    <section className="space-y-2">
      {outcome !== "Agrees" ? (
        <h2 className="text-sm font-semibold text-foreground">
          {outcome}
          <span className="ml-2 font-normal text-muted-foreground">{rows.length}</span>
        </h2>
      ) : null}
      <div className="overflow-x-auto rounded-card border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Approved</TableHead>
              <TableHead className="text-right">Xero draft</TableHead>
              <TableHead className="text-right">Delta</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead className="min-w-[16rem]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <MatchRow
                key={row.id}
                row={row}
                candidates={candidates}
                mbaOptions={mbaOptions}
                busy={busyId === row.id}
                assignClient={assignClient[row.id]}
                assignMba={assignMba[row.id]}
                assignKey={assignKey[row.id]}
                setAssignClient={(v) => setAssignClient((p) => ({ ...p, [row.id]: v }))}
                setAssignMba={(v) => setAssignMba((p) => ({ ...p, [row.id]: v }))}
                setAssignKey={(v) => setAssignKey((p) => ({ ...p, [row.id]: v }))}
                onAccept={() => onAccept(row)}
                onAssign={(key) => onAssign(row, key)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function MatchRow({
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

  return (
    <TableRow className="interactive-row">
      <TableCell className="text-xs">
        <p className="font-medium text-foreground">{row.client_name}</p>
        {row.drafts.length > 1 ? (
          <p className="text-[11px] text-muted-foreground">{row.drafts.length} drafts</p>
        ) : null}
      </TableCell>
      <TableCell className="num text-xs">{row.billing_month || "—"}</TableCell>
      <TableCell className="num text-right text-xs">{moneyCell(row.approved_amount_cents)}</TableCell>
      <TableCell className="num text-right text-xs">{moneyCell(row.xero_amount_cents)}</TableCell>
      <TableCell className={cn("num text-right text-xs", deltaClass(row.delta_cents))}>
        {moneyCell(row.delta_cents)}
      </TableCell>
      <TableCell>
        <Badge variant={OUTCOME_BADGE[row.outcome]} size="sm">
          {row.outcome}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-2 py-1">
          {row.drafts.map((d) =>
            d.xero_url ? (
              <a
                key={d.xero_invoice_id}
                href={d.xero_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open {d.invoice_number || "draft"}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <p key={d.xero_invoice_id} className="num text-xs text-muted-foreground">
                Search in Xero: {d.invoice_number || d.xero_invoice_id}
              </p>
            )
          )}
          {canAccept ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onAccept}>
              Accept Xero figure
            </Button>
          ) : null}
          {canAssign ? (
            <div className="flex flex-col gap-1.5">
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
      </TableCell>
    </TableRow>
  )
}
