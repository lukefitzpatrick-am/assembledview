"use client"

/**
 * COPY of hub `FinanceXeroQueuePanel` for sections `/finance/xero`.
 * FIN-7: descriptive lead column + guided client → MBA cascade (assignment UX only).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
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
import { formatAUD } from "@/lib/format/money"
import { getClientDisplayName } from "@/lib/clients/slug"
import {
  contactSecondaryLine,
  pendingLeadText,
} from "@/lib/finance/sections/xero/pendingIdentity"
import { cn } from "@/lib/utils"

type PendingRecord = {
  id: number
  invoice_key?: string | null
  client_name?: string | null
  clients_id?: number | null
  billing_month?: string | null
  total?: number | null
  billing_type?: string | null
  mba_number?: string | null
  has_pending_edits?: boolean
  reference?: string | null
  first_line_description?: string | null
  invoice_number?: string | null
  contact_name?: string | null
}

type SyncException = {
  id: number
  invoice_number?: string | null
  issue_date?: string | null
  reference?: string | null
  reason?: string | null
  resolved?: boolean
}

type ClientOption = {
  id: number
  name: string
}

type MbaOption = {
  mba_number: string
  campaign_name: string
  client_id: number | null
}

type QueuePayload = {
  pending: PendingRecord[]
  exceptions: SyncException[]
  mbaOptions?: MbaOption[]
  meta?: { issue_date_min?: string }
}

const MBA_MANUAL = "__manual__"

function pendingReason(row: PendingRecord): { label: string; kind: "client" | "mba" | "both" } {
  const clientMissing =
    row.clients_id == null ||
    !Number.isFinite(Number(row.clients_id)) ||
    Number(row.clients_id) <= 0 ||
    !(row.client_name ?? "").trim()
  const mbaMissing = !(row.mba_number ?? "").trim()
  if (clientMissing && mbaMissing) return { label: "Client + MBA", kind: "both" }
  if (clientMissing) return { label: "Client unresolved", kind: "client" }
  if (mbaMissing) return { label: "MBA missing", kind: "mba" }
  return { label: "Pending edits", kind: "both" }
}

function mbaOptionLabel(opt: MbaOption): string {
  const campaign = opt.campaign_name.trim()
  return campaign ? `${opt.mba_number} · ${campaign}` : opt.mba_number
}

export function XeroExceptionsPanel() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingRecord[]>([])
  const [exceptions, setExceptions] = useState<SyncException[]>([])
  const [mbaOptions, setMbaOptions] = useState<MbaOption[]>([])
  const [issueDateMin, setIssueDateMin] = useState("2025-07-01")
  const [clients, setClients] = useState<ClientOption[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  /** Selected MBA from dropdown (or MBA_MANUAL). */
  const [mbaSelect, setMbaSelect] = useState<Record<number, string>>({})
  /** Free-text MBA when dropdown is empty / manual / unmatched. */
  const [mbaDrafts, setMbaDrafts] = useState<Record<number, string>>({})
  const [keyOpen, setKeyOpen] = useState<Record<number, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [queueRes, clientsRes] = await Promise.all([
        fetch("/api/finance/xero-queue"),
        fetch("/api/clients"),
      ])
      if (!queueRes.ok) {
        const body = (await queueRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || `Queue load failed (${queueRes.status})`)
      }
      const queue = (await queueRes.json()) as QueuePayload
      setPending(Array.isArray(queue.pending) ? queue.pending : [])
      setExceptions(Array.isArray(queue.exceptions) ? queue.exceptions : [])
      setMbaOptions(Array.isArray(queue.mbaOptions) ? queue.mbaOptions : [])
      if (queue.meta?.issue_date_min) setIssueDateMin(queue.meta.issue_date_min)

      if (clientsRes.ok) {
        const raw = (await clientsRes.json()) as unknown
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as { items?: unknown }).items)
            ? (raw as { items: unknown[] }).items
            : []
        setClients(
          list
            .map((c) => {
              const row = c as Record<string, unknown>
              const id = Number(row.id)
              if (!Number.isFinite(id) || id <= 0) return null
              return { id, name: getClientDisplayName(row) || `Client ${id}` }
            })
            .filter((c): c is ClientOption => c != null)
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Xero queue")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const mutate = useCallback(
    async (body: Record<string, unknown>, busyKey: string) => {
      setBusyId(busyKey)
      try {
        const res = await fetch("/api/finance/xero-queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
          throw new Error(err.message || err.error || `Request failed (${res.status})`)
        }
        await load()
        toast({ title: "Updated", description: "Queue change saved." })
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Queue update failed",
          description: e instanceof Error ? e.message : "Unknown error",
        })
      } finally {
        setBusyId(null)
      }
    },
    [load, toast]
  )

  const pendingSorted = useMemo(
    () =>
      [...pending].sort(
        (a, b) =>
          String(a.billing_month ?? "").localeCompare(String(b.billing_month ?? "")) ||
          pendingLeadText(a).localeCompare(pendingLeadText(b)) ||
          String(a.invoice_key ?? "").localeCompare(String(b.invoice_key ?? ""))
      ),
    [pending]
  )

  if (loading && pending.length === 0 && exceptions.length === 0) {
    return <LoadingState rows={6} />
  }

  if (error && pending.length === 0 && exceptions.length === 0) {
    return (
      <ErrorState title="Could not load Xero queue" message={error} onRetry={() => void load()} />
    )
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-foreground">Pending records</h2>
            <p className="text-xs text-muted-foreground">
              {pendingSorted.length} billing row{pendingSorted.length === 1 ? "" : "s"} with pending
              edits
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Refresh
          </Button>
        </div>

        {pendingSorted.length === 0 ? (
          <EmptyState
            title="No pending records"
            message="No finance billing rows currently marked pending."
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[14rem]">Description / reference</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Why pending</TableHead>
                  <TableHead className="min-w-[16rem]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSorted.map((row) => {
                  const reason = pendingReason(row)
                  const busy = busyId === `pending-${row.id}`
                  const lead = pendingLeadText(row)
                  const contactLine = contactSecondaryLine(row.contact_name, row.client_name)
                  const clientId =
                    row.clients_id != null && Number.isFinite(Number(row.clients_id))
                      ? Number(row.clients_id)
                      : null
                  const clientMbas =
                    clientId != null
                      ? mbaOptions.filter((m) => m.client_id === clientId)
                      : []
                  const existingMba = (row.mba_number ?? "").trim()
                  const inList = clientMbas.some((m) => m.mba_number === existingMba)
                  const selectValue =
                    mbaSelect[row.id] ??
                    (existingMba && inList
                      ? existingMba
                      : existingMba || clientMbas.length === 0
                        ? MBA_MANUAL
                        : "")
                  const showManual =
                    selectValue === MBA_MANUAL || clientMbas.length === 0 || (existingMba && !inList)
                  const manualValue = mbaDrafts[row.id] ?? (!inList ? existingMba : "")

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[18rem] text-xs">
                        <div className="space-y-1">
                          <p
                            className="truncate font-medium text-foreground"
                            title={lead}
                          >
                            {lead}
                          </p>
                          {row.first_line_description &&
                          (row.reference ?? "").trim() &&
                          (row.first_line_description ?? "").trim() !==
                            (row.reference ?? "").trim() ? (
                            <p className="truncate text-[11px] text-muted-foreground" title={row.first_line_description}>
                              {row.first_line_description}
                            </p>
                          ) : null}
                          {row.invoice_key ? (
                            <Collapsible
                              open={keyOpen[row.id] === true}
                              onOpenChange={(open) =>
                                setKeyOpen((prev) => ({ ...prev, [row.id]: open }))
                              }
                            >
                              <CollapsibleTrigger
                                type="button"
                                className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                                title={row.invoice_key}
                              >
                                <ChevronDown
                                  className={cn(
                                    "h-3 w-3 transition-transform",
                                    keyOpen[row.id] ? "rotate-180" : ""
                                  )}
                                />
                                Invoice key
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <p className="num mt-0.5 break-all text-[10px] text-muted-foreground">
                                  {row.invoice_key}
                                </p>
                              </CollapsibleContent>
                            </Collapsible>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[10rem] text-xs">
                        <p className="truncate">{row.client_name || "—"}</p>
                        {contactLine ? (
                          <p
                            className="truncate text-[11px] text-muted-foreground"
                            title={`Xero contact: ${contactLine}`}
                          >
                            {contactLine}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="num text-xs">{row.billing_month || "—"}</TableCell>
                      <TableCell className="num text-right text-xs">
                        {formatAUD(Number(row.total) || 0)}
                      </TableCell>
                      <TableCell className="text-xs uppercase">{row.billing_type || "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            reason.kind === "client"
                              ? "behind"
                              : reason.kind === "mba"
                                ? "on-track"
                                : "critical"
                          }
                          size="sm"
                        >
                          {reason.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2 py-1">
                          <Select
                            disabled={busy}
                            value={
                              clientId != null && clients.some((c) => c.id === clientId)
                                ? String(clientId)
                                : undefined
                            }
                            onValueChange={(value) => {
                              const client = clients.find((c) => String(c.id) === value)
                              if (!client) return
                              void mutate(
                                {
                                  action: "assign_client",
                                  id: row.id,
                                  clients_id: client.id,
                                  client_name: client.name,
                                },
                                `pending-${row.id}`
                              )
                            }}
                          >
                            <SelectTrigger className="h-8 w-full max-w-[14rem] text-xs">
                              <SelectValue placeholder="Assign client" />
                            </SelectTrigger>
                            <SelectContent>
                              {clients.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {clientId != null ? (
                            <>
                              {clientMbas.length > 0 ? (
                                <Select
                                  disabled={busy}
                                  value={selectValue || undefined}
                                  onValueChange={(value) => {
                                    setMbaSelect((prev) => ({ ...prev, [row.id]: value }))
                                    if (value !== MBA_MANUAL) {
                                      setMbaDrafts((prev) => ({ ...prev, [row.id]: value }))
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 w-full max-w-[14rem] text-xs">
                                    <SelectValue placeholder="Select MBA" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {clientMbas.map((m) => (
                                      <SelectItem key={m.mba_number} value={m.mba_number}>
                                        {mbaOptionLabel(m)}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value={MBA_MANUAL}>Enter MBA manually…</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <p className="text-[11px] text-muted-foreground">
                                  No MBAs for this client — enter manually.
                                </p>
                              )}
                              {showManual ? (
                                <Input
                                  className="h-8 max-w-[14rem] text-xs"
                                  placeholder="MBA number"
                                  value={manualValue}
                                  disabled={busy}
                                  onChange={(e) =>
                                    setMbaDrafts((prev) => ({
                                      ...prev,
                                      [row.id]: e.target.value,
                                    }))
                                  }
                                />
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="w-fit"
                                disabled={busy}
                                onClick={() => {
                                  const fromSelect =
                                    selectValue && selectValue !== MBA_MANUAL
                                      ? selectValue
                                      : ""
                                  const mba = (fromSelect || manualValue || "").trim()
                                  if (!mba) return
                                  void mutate(
                                    { action: "assign_mba", id: row.id, mba_number: mba },
                                    `pending-${row.id}`
                                  )
                                }}
                              >
                                Set
                              </Button>
                            </>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">
                              Assign a client to choose an MBA.
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Sync exceptions</h2>
          <p className="text-xs text-muted-foreground">
            Unresolved Xero sync exceptions from {issueDateMin} onward · {exceptions.length} row
            {exceptions.length === 1 ? "" : "s"}
          </p>
        </div>

        {exceptions.length === 0 ? (
          <EmptyState
            title="No sync exceptions"
            message="No unresolved Xero sync exceptions in range."
          />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Issue date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-[8rem]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exceptions.map((ex) => {
                  const busy = busyId === `ex-${ex.id}`
                  return (
                    <TableRow key={ex.id}>
                      <TableCell className="num text-xs">{ex.invoice_number || "—"}</TableCell>
                      <TableCell className="num text-xs">
                        {String(ex.issue_date ?? "—").slice(0, 10)}
                      </TableCell>
                      <TableCell className="max-w-[12rem] truncate text-xs">
                        {ex.reference || "—"}
                      </TableCell>
                      <TableCell className="max-w-[16rem] text-xs text-muted-foreground">
                        {ex.reason || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void mutate({ action: "resolve_exception", id: ex.id }, `ex-${ex.id}`)
                          }
                        >
                          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                          Resolve
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
