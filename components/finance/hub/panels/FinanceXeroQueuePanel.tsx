"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

type QueuePayload = {
  pending: PendingRecord[]
  exceptions: SyncException[]
}

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

export default function FinanceXeroQueuePanel() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingRecord[]>([])
  const [exceptions, setExceptions] = useState<SyncException[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [mbaDrafts, setMbaDrafts] = useState<Record<number, string>>({})

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

      if (clientsRes.ok) {
        const raw = (await clientsRes.json()) as unknown
        const list = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown }).items)
          ? ((raw as { items: unknown[] }).items)
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
      [...pending].sort((a, b) =>
        String(a.billing_month ?? "").localeCompare(String(b.billing_month ?? "")) ||
        String(a.invoice_key ?? "").localeCompare(String(b.invoice_key ?? ""))
      ),
    [pending]
  )

  if (loading && pending.length === 0 && exceptions.length === 0) {
    return <LoadingState rows={6} />
  }

  if (error && pending.length === 0 && exceptions.length === 0) {
    return <ErrorState title="Could not load Xero queue" message={error} onRetry={() => void load()} />
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-foreground">Pending records</h2>
            <p className="text-xs text-muted-foreground">
              {pendingSorted.length} billing row{pendingSorted.length === 1 ? "" : "s"} with pending edits
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Refresh
          </Button>
        </div>

        {pendingSorted.length === 0 ? (
          <EmptyState title="No pending records" message="No finance billing rows currently marked pending." />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice key</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Why pending</TableHead>
                  <TableHead className="min-w-[14rem]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSorted.map((row) => {
                  const reason = pendingReason(row)
                  const busy = busyId === `pending-${row.id}`
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="num max-w-[12rem] truncate text-xs">
                        {row.invoice_key || "—"}
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate text-xs">
                        {row.client_name || "—"}
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
                            <SelectTrigger className="h-8 w-full max-w-[12rem] text-xs">
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
                          <div className="flex items-center gap-1.5">
                            <Input
                              className="h-8 max-w-[9rem] text-xs"
                              placeholder="MBA number"
                              value={mbaDrafts[row.id] ?? row.mba_number ?? ""}
                              disabled={busy}
                              onChange={(e) =>
                                setMbaDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                const mba = (mbaDrafts[row.id] ?? row.mba_number ?? "").trim()
                                if (!mba) return
                                void mutate(
                                  { action: "assign_mba", id: row.id, mba_number: mba },
                                  `pending-${row.id}`
                                )
                              }}
                            >
                              Set MBA
                            </Button>
                          </div>
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
            Unresolved Xero sync exceptions from {exceptions.length === 0 ? "—" : "2025-07-01"} onward ·{" "}
            {exceptions.length} row{exceptions.length === 1 ? "" : "s"}
          </p>
        </div>

        {exceptions.length === 0 ? (
          <EmptyState title="No sync exceptions" message="No unresolved Xero sync exceptions in range." />
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
                      <TableCell className="num text-xs">{String(ex.issue_date ?? "—").slice(0, 10)}</TableCell>
                      <TableCell className="max-w-[12rem] truncate text-xs">{ex.reference || "—"}</TableCell>
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
