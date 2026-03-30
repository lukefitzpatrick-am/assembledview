"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Combobox } from "@/components/ui/combobox"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import {
  type ClientKpi,
  type ClientKpiInput,
  CLIENT_KPI_METRIC_FIELDS,
  CLIENT_KPI_METRIC_LABELS,
  getBidStrategiesForMediaType,
  MEDIA_TYPE_OPTIONS,
} from "@/lib/types/clientKpi"
import type { Publisher } from "@/lib/types/publisher"

export interface ClientKpiSectionProps {
  /** mp_client_name — pre-set, not editable by user */
  clientName: string
  /** For slug-based needs (e.g. analytics keys) */
  urlSlug: string
}

type PendingRow = ClientKpiInput & { tempId: string }

type PersistOk = { ok: true; data: ClientKpi }
type PersistFail = { ok: false; message: string }
type PersistResult = PersistOk | PersistFail

function emptyPendingRow(clientName: string, tempId: string): PendingRow {
  return {
    tempId,
    mp_client_name: clientName,
    publisher_name: "",
    media_type: "",
    bid_strategy: "",
    ctr: 0,
    cpv: 0,
    conversion_rate: 0,
    vtr: 0,
    frequency: 0,
  }
}

function rowReady(publisher_name: string, media_type: string, bid_strategy: string): boolean {
  return (
    publisher_name.trim() !== "" && media_type.trim() !== "" && bid_strategy.trim() !== ""
  )
}

function parseMetric(raw: string, fallback: number): number {
  if (raw.trim() === "") return 0
  const v = parseFloat(raw)
  return Number.isFinite(v) ? v : fallback
}

function inputFromPending(row: PendingRow): ClientKpiInput {
  return {
    mp_client_name: row.mp_client_name,
    publisher_name: row.publisher_name,
    media_type: row.media_type,
    bid_strategy: row.bid_strategy,
    ctr: row.ctr,
    cpv: row.cpv,
    conversion_rate: row.conversion_rate,
    vtr: row.vtr,
    frequency: row.frequency,
  }
}

async function persistCreate(body: ClientKpiInput): Promise<PersistResult> {
  try {
    const res = await fetch("/api/client-kpis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        ok: false,
        message: typeof err?.error === "string" ? err.error : res.statusText,
      }
    }
    const data = (await res.json()) as ClientKpi
    return { ok: true, data }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}

async function persistUpdate(row: ClientKpi): Promise<PersistResult> {
  try {
    const res = await fetch("/api/client-kpis", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        publisher_name: row.publisher_name,
        media_type: row.media_type,
        bid_strategy: row.bid_strategy,
        ctr: row.ctr,
        cpv: row.cpv,
        conversion_rate: row.conversion_rate,
        vtr: row.vtr,
        frequency: row.frequency,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        ok: false,
        message: typeof err?.error === "string" ? err.error : res.statusText,
      }
    }
    const data = (await res.json()) as ClientKpi
    return { ok: true, data }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}

export function ClientKpiSection({ clientName, urlSlug }: ClientKpiSectionProps) {
  const { toast } = useToast()
  const [rows, setRows] = useState<ClientKpi[]>([])
  const [pending, setPending] = useState<PendingRow[]>([])
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [loading, setLoading] = useState(true)
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set())
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const savingAll = savingKey === "__all__"
  const anySaving = savingKey !== null

  const publisherOptions = useMemo(
    () =>
      publishers.map((p) => ({
        value: p.publisher_name || "",
        label: p.publisher_name || `Publisher ${p.id}`,
      })).filter((o) => o.value !== ""),
    [publishers]
  )

  const pendingReady = useMemo(
    () =>
      pending.filter((r) =>
        rowReady(r.publisher_name, r.media_type, r.bid_strategy)
      ),
    [pending]
  )

  const dirtyReady = useMemo(
    () =>
      rows.filter(
        (r) =>
          dirtyIds.has(r.id) &&
          rowReady(r.publisher_name, r.media_type, r.bid_strategy)
      ),
    [rows, dirtyIds]
  )

  const canSaveAll =
    pendingReady.length > 0 || dirtyReady.length > 0

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const trimmed = clientName.trim()
      try {
        const pubPromise = fetch("/api/publishers")
        const kpisPromise = trimmed
          ? fetch(
              `/api/client-kpis?mp_client_name=${encodeURIComponent(trimmed)}`
            )
          : null

        const pubRes = await pubPromise
        if (cancelled) return

        if (kpisPromise) {
          const kpisRes = await kpisPromise
          if (cancelled) return
          if (kpisRes.ok) {
            const data = await kpisRes.json()
            setRows(Array.isArray(data) ? data : [])
          } else {
            setRows([])
          }
        } else {
          setRows([])
        }

        if (pubRes.ok) {
          const data = await pubRes.json()
          setPublishers(Array.isArray(data) ? data : [])
        } else {
          setPublishers([])
        }
      } catch (e) {
        console.error("ClientKpiSection load", e)
        if (!cancelled) {
          setRows([])
          setPublishers([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clientName, urlSlug])

  function markDirty(id: number) {
    setDirtyIds((s) => new Set(s).add(id))
  }

  function updateSaved(id: number, patch: Partial<ClientKpi>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    )
    markDirty(id)
  }

  function updatePending(tempId: string, patch: Partial<ClientKpiInput>) {
    setPending((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r))
    )
  }

  function addKpiRow() {
    setPending((p) => [...p, emptyPendingRow(clientName, crypto.randomUUID())])
  }

  async function savePending(row: PendingRow) {
    if (!rowReady(row.publisher_name, row.media_type, row.bid_strategy)) {
      toast({
        title: "Missing fields",
        description: "Publisher, media type, and bid strategy are required.",
        variant: "destructive",
      })
      return
    }
    setSavingKey(row.tempId)
    try {
      const result = await persistCreate(inputFromPending(row))
      if (!result.ok) {
        toast({
          title: "Save failed",
          description: result.message,
          variant: "destructive",
        })
        return
      }
      setPending((p) => p.filter((x) => x.tempId !== row.tempId))
      setRows((r) => [...r, result.data])
      toast({ title: "Saved", description: "KPI row created." })
    } finally {
      setSavingKey(null)
    }
  }

  async function saveSaved(row: ClientKpi) {
    if (!rowReady(row.publisher_name, row.media_type, row.bid_strategy)) {
      toast({
        title: "Missing fields",
        description: "Publisher, media type, and bid strategy are required.",
        variant: "destructive",
      })
      return
    }
    setSavingKey(`id:${row.id}`)
    try {
      const result = await persistUpdate(row)
      if (!result.ok) {
        toast({
          title: "Save failed",
          description: result.message,
          variant: "destructive",
        })
        return
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? result.data : r)))
      setDirtyIds((s) => {
        const n = new Set(s)
        n.delete(row.id)
        return n
      })
      toast({ title: "Saved", description: "KPI row updated." })
    } finally {
      setSavingKey(null)
    }
  }

  async function saveAllKpis() {
    if (!canSaveAll) {
      const hasDrafts = pending.length > 0 || dirtyIds.size > 0
      toast({
        title: hasDrafts ? "Complete required fields" : "Nothing to save",
        description: hasDrafts
          ? "Each KPI needs publisher, media type, and bid strategy before it can be saved."
          : "Add or edit KPIs, then save.",
        variant: hasDrafts ? "destructive" : "default",
      })
      return
    }

    setSavingKey("__all__")
    let created = 0
    let updated = 0
    let failed = 0

    try {
      const pendingSnapshot = [...pendingReady]
      for (const row of pendingSnapshot) {
        const result = await persistCreate(inputFromPending(row))
        if (result.ok) {
          created++
          setPending((p) => p.filter((x) => x.tempId !== row.tempId))
          setRows((r) => [...r, result.data])
        } else {
          failed++
          console.error("Save all create failed", result.message)
        }
      }

      const dirtySnapshot = [...dirtyReady]
      for (const row of dirtySnapshot) {
        const result = await persistUpdate(row)
        if (result.ok) {
          updated++
          setRows((prev) =>
            prev.map((r) => (r.id === row.id ? result.data : r))
          )
          setDirtyIds((s) => {
            const n = new Set(s)
            n.delete(row.id)
            return n
          })
        } else {
          failed++
          console.error("Save all update failed", result.message)
        }
      }

      if (failed === 0) {
        toast({
          title: "All KPIs saved",
          description: [
            created > 0 ? `${created} new` : null,
            updated > 0 ? `${updated} updated` : null,
          ]
            .filter(Boolean)
            .join(", "),
        })
      } else {
        toast({
          title: "Save finished with errors",
          description: `${created} created, ${updated} updated, ${failed} failed. Fix rows and try again.`,
          variant: "destructive",
        })
      }
    } finally {
      setSavingKey(null)
    }
  }

  async function removeSaved(row: ClientKpi) {
    setSavingKey(`del:${row.id}`)
    try {
      const res = await fetch(`/api/client-kpis?id=${encodeURIComponent(String(row.id))}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast({
          title: "Delete failed",
          description: typeof err?.error === "string" ? err.error : res.statusText,
          variant: "destructive",
        })
        return
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      setDirtyIds((s) => {
        const n = new Set(s)
        n.delete(row.id)
        return n
      })
      toast({ title: "Deleted", description: "KPI row removed." })
    } catch (e) {
      console.error(e)
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setSavingKey(null)
    }
  }

  const totalRows = rows.length + pending.length
  const showEmpty = !loading && totalRows === 0

  return (
    <Card className="rounded-2xl border-muted/70">
      <CardHeader className="border-b border-muted/40 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Client KPIs</CardTitle>
            <CardDescription>
              Configure KPI benchmarks per publisher and media type. Use Save all to sync everything to Xano.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={!canSaveAll || anySaving}
              onClick={() => void saveAllKpis()}
            >
              {savingAll ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Save all
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={addKpiRow} disabled={anySaving}>
              <Plus className="mr-1 h-4 w-4" />
              Add KPI
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        ) : showEmpty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No KPIs configured yet. Click &apos;Add KPI&apos; to get started.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
            {rows.map((row) => (
              <div
                key={`saved-${row.id}`}
                className="flex flex-col rounded-xl border border-border/60 bg-card p-4 shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Saved · ID {row.id}
                  </span>
                  {dirtyIds.has(row.id) ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="md:col-span-2 xl:col-span-1">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Publisher</p>
                    <Combobox
                      options={publisherOptions}
                      value={row.publisher_name}
                      onValueChange={(v) => updateSaved(row.id, { publisher_name: v })}
                      placeholder="Publisher"
                      searchPlaceholder="Search publishers..."
                      emptyText="No publishers found."
                      buttonClassName="h-8 w-full"
                      disabled={anySaving}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Media type</p>
                    <Combobox
                      options={MEDIA_TYPE_OPTIONS}
                      value={row.media_type}
                      onValueChange={(v) =>
                        updateSaved(row.id, { media_type: v, bid_strategy: "" })
                      }
                      placeholder="Media type"
                      searchPlaceholder="Search..."
                      emptyText="No results."
                      buttonClassName="h-8 w-full"
                      disabled={anySaving}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Bid strategy</p>
                    <Combobox
                      options={getBidStrategiesForMediaType(row.media_type)}
                      value={row.bid_strategy}
                      onValueChange={(v) => updateSaved(row.id, { bid_strategy: v })}
                      placeholder="Bid strategy"
                      searchPlaceholder="Search..."
                      emptyText="No options."
                      disabled={!row.media_type || anySaving}
                      buttonClassName="h-8 w-full"
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {CLIENT_KPI_METRIC_FIELDS.map((field) => (
                    <div key={field} className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {CLIENT_KPI_METRIC_LABELS[field] ?? field}
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        min={0}
                        className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                        value={row[field]}
                        disabled={anySaving}
                        onChange={(e) =>
                          updateSaved(row.id, {
                            [field]: parseMetric(e.target.value, row[field]),
                          } as Partial<ClientKpi>)
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border/50 pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={
                      !dirtyIds.has(row.id) ||
                      savingKey === `id:${row.id}` ||
                      anySaving ||
                      !rowReady(
                        row.publisher_name,
                        row.media_type,
                        row.bid_strategy
                      )
                    }
                    onClick={() => void saveSaved(row)}
                  >
                    {savingKey === `id:${row.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={savingKey === `del:${row.id}` || anySaving}
                    onClick={() => void removeSaved(row)}
                    aria-label="Delete KPI row"
                  >
                    {savingKey === `del:${row.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}

            {pending.map((row) => (
              <div
                key={row.tempId}
                className="flex flex-col rounded-xl border border-dashed border-border/80 bg-muted/15 p-4 shadow-sm"
              >
                <div className="mb-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    New KPI
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="md:col-span-2 xl:col-span-1">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Publisher</p>
                    <Combobox
                      options={publisherOptions}
                      value={row.publisher_name}
                      onValueChange={(v) => updatePending(row.tempId, { publisher_name: v })}
                      placeholder="Publisher"
                      searchPlaceholder="Search publishers..."
                      emptyText="No publishers found."
                      buttonClassName="h-8 w-full"
                      disabled={anySaving}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Media type</p>
                    <Combobox
                      options={MEDIA_TYPE_OPTIONS}
                      value={row.media_type}
                      onValueChange={(v) =>
                        updatePending(row.tempId, { media_type: v, bid_strategy: "" })
                      }
                      placeholder="Media type"
                      searchPlaceholder="Search..."
                      emptyText="No results."
                      buttonClassName="h-8 w-full"
                      disabled={anySaving}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Bid strategy</p>
                    <Combobox
                      options={getBidStrategiesForMediaType(row.media_type)}
                      value={row.bid_strategy}
                      onValueChange={(v) => updatePending(row.tempId, { bid_strategy: v })}
                      placeholder="Bid strategy"
                      searchPlaceholder="Search..."
                      emptyText="No options."
                      disabled={!row.media_type || anySaving}
                      buttonClassName="h-8 w-full"
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {CLIENT_KPI_METRIC_FIELDS.map((field) => (
                    <div key={field} className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {CLIENT_KPI_METRIC_LABELS[field] ?? field}
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        min={0}
                        className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                        value={row[field]}
                        disabled={anySaving}
                        onChange={(e) =>
                          updatePending(row.tempId, {
                            [field]: parseMetric(e.target.value, row[field]),
                          } as Partial<ClientKpiInput>)
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border/50 pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={
                      savingKey === row.tempId ||
                      anySaving ||
                      !rowReady(
                        row.publisher_name,
                        row.media_type,
                        row.bid_strategy
                      )
                    }
                    onClick={() => void savePending(row)}
                  >
                    {savingKey === row.tempId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
