"use client"

import { useEffect, useMemo, useState } from "react"
import { Layers, Loader2, Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Combobox } from "@/components/ui/combobox"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { mediaTypeComboboxOptionsForPublisher } from "@/lib/publisher/publisherKpiMediaOptions"
import type { Publisher } from "@/lib/types/publisher"
import type { PublisherKpi, PublisherKpiInput } from "@/lib/types/publisherKpi"
import {
  CLIENT_KPI_METRIC_FIELDS,
  CLIENT_KPI_METRIC_LABELS,
  getBidStrategiesForMediaType,
} from "@/lib/types/clientKpi"
import { formatPercentForInput, parsePercentHeuristic } from "@/lib/kpi/percentMetrics"

const PERCENT_KPI_FIELDS = new Set<string>(["ctr", "vtr", "conversion_rate"])

interface PublisherKpiFormProps {
  publisher: Publisher
  onSuccess?: () => void | Promise<void>
}

type PendingRow = PublisherKpiInput & { tempId: string }

type PersistOk = { ok: true; data: PublisherKpi }
type PersistFail = { ok: false; message: string }
type PersistResult = PersistOk | PersistFail

function emptyPendingRow(
  publisherKey: string,
  tempId: string,
  overrides?: Partial<PublisherKpiInput>,
): PendingRow {
  return {
    tempId,
    publisher: publisherKey,
    media_type: "",
    bid_strategy: "",
    ctr: 0,
    cpv: 0,
    conversion_rate: 0,
    vtr: 0,
    frequency: 0,
    ...overrides,
  }
}

function rowKey(media_type: string, bid_strategy: string): string {
  return `${media_type}\0${bid_strategy}`
}

function rowReady(media_type: string, bid_strategy: string): boolean {
  return media_type.trim() !== "" && bid_strategy.trim() !== ""
}

function parseMetric(raw: string, fallback: number): number {
  if (raw.trim() === "") return 0
  const v = parseFloat(raw)
  return Number.isFinite(v) ? v : fallback
}

function inputFromPending(row: PendingRow): PublisherKpiInput {
  return {
    publisher: row.publisher,
    media_type: row.media_type,
    bid_strategy: row.bid_strategy,
    ctr: row.ctr,
    cpv: row.cpv,
    conversion_rate: row.conversion_rate,
    vtr: row.vtr,
    frequency: row.frequency,
  }
}

async function persistCreate(body: PublisherKpiInput): Promise<PersistResult> {
  try {
    const res = await fetch("/api/publisher-kpis", {
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
    const data = (await res.json()) as PublisherKpi
    return { ok: true, data }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}

async function persistUpdate(row: PublisherKpi): Promise<PersistResult> {
  try {
    const res = await fetch("/api/publisher-kpis", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        publisher: row.publisher,
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
    const data = (await res.json()) as PublisherKpi
    return { ok: true, data }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}

export function PublisherKpiForm({ publisher, onSuccess }: PublisherKpiFormProps) {
  const { toast } = useToast()
  const publisherKey = String(publisher.publisherid ?? "").trim()

  const mediaTypeOptions = useMemo(
    () => mediaTypeComboboxOptionsForPublisher(publisher),
    [publisher],
  )

  const [rows, setRows] = useState<PublisherKpi[]>([])
  const [pending, setPending] = useState<PendingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set())
  const [savingKey, setSavingKey] = useState<string | null>(null)
  /** Media type used by “add all bid strategies” shortcut */
  const [bulkMediaSlug, setBulkMediaSlug] = useState("")

  const savingAll = savingKey === "__all__"
  const anySaving = savingKey !== null

  useEffect(() => {
    if (!bulkMediaSlug && mediaTypeOptions.length > 0) {
      setBulkMediaSlug(mediaTypeOptions[0].value)
    }
    if (bulkMediaSlug && !mediaTypeOptions.some((o) => o.value === bulkMediaSlug)) {
      setBulkMediaSlug(mediaTypeOptions[0]?.value ?? "")
    }
  }, [mediaTypeOptions, bulkMediaSlug])

  const existingPairKeys = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) {
      if (rowReady(r.media_type, r.bid_strategy)) s.add(rowKey(r.media_type, r.bid_strategy))
    }
    for (const p of pending) {
      if (rowReady(p.media_type, p.bid_strategy)) s.add(rowKey(p.media_type, p.bid_strategy))
    }
    return s
  }, [rows, pending])

  const pendingReady = useMemo(
    () => pending.filter((r) => rowReady(r.media_type, r.bid_strategy)),
    [pending],
  )

  const dirtyReady = useMemo(
    () =>
      rows.filter(
        (r) => dirtyIds.has(r.id) && rowReady(r.media_type, r.bid_strategy),
      ),
    [rows, dirtyIds],
  )

  const canSaveAll = pendingReady.length > 0 || dirtyReady.length > 0

  const sortedSavedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const mt = a.media_type.localeCompare(b.media_type)
      if (mt !== 0) return mt
      const bs = a.bid_strategy.localeCompare(b.bid_strategy)
      if (bs !== 0) return bs
      return a.id - b.id
    })
  }, [rows])

  useEffect(() => {
    if (!publisherKey) {
      setRows([])
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/publisher-kpis?publisher=${encodeURIComponent(publisherKey)}`,
        )
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          setRows(Array.isArray(data) ? data : [])
        } else {
          setRows([])
        }
      } catch (e) {
        console.error("PublisherKpiForm load", e)
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [publisherKey])

  function markDirty(id: number) {
    setDirtyIds((s) => new Set(s).add(id))
  }

  function updateSaved(id: number, patch: Partial<PublisherKpi>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    markDirty(id)
  }

  function updatePending(tempId: string, patch: Partial<PublisherKpiInput>) {
    setPending((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, ...patch, publisher: publisherKey } : r)),
    )
  }

  function addKpiRow() {
    if (!publisherKey) return
    setPending((p) => [...p, emptyPendingRow(publisherKey, crypto.randomUUID())])
  }

  /** One pending row per bid strategy for the chosen media type (skips pairs already on screen). */
  function addAllBidStrategiesForMedia() {
    if (!publisherKey || !bulkMediaSlug) {
      toast({
        title: "Pick a media type",
        description: "Choose which channel to expand with all bid strategies.",
        variant: "destructive",
      })
      return
    }
    const strategies = getBidStrategiesForMediaType(bulkMediaSlug)
    if (strategies.length === 0) {
      toast({
        title: "No bid strategies",
        description: "This media type has no configured bid / targeting options.",
        variant: "destructive",
      })
      return
    }
    const toAdd: PendingRow[] = []
    for (const opt of strategies) {
      const k = rowKey(bulkMediaSlug, opt.value)
      if (existingPairKeys.has(k)) continue
      toAdd.push(
        emptyPendingRow(publisherKey, crypto.randomUUID(), {
          media_type: bulkMediaSlug,
          bid_strategy: opt.value,
        }),
      )
    }
    if (toAdd.length === 0) {
      toast({
        title: "Already covered",
        description: "Every bid strategy for this media type already has a row (saved or draft).",
      })
      return
    }
    setPending((p) => [...p, ...toAdd])
    toast({
      title: "Rows added",
      description: `${toAdd.length} draft row(s) — set metrics and save.`,
    })
  }

  async function savePending(row: PendingRow) {
    if (!rowReady(row.media_type, row.bid_strategy)) {
      toast({
        title: "Missing fields",
        description: "Media type and bid strategy are required.",
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
      await onSuccess?.()
    } finally {
      setSavingKey(null)
    }
  }

  async function saveSaved(row: PublisherKpi) {
    if (!rowReady(row.media_type, row.bid_strategy)) {
      toast({
        title: "Missing fields",
        description: "Media type and bid strategy are required.",
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
      await onSuccess?.()
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
          ? "Each KPI needs media type and bid strategy before it can be saved."
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
          setRows((prev) => prev.map((r) => (r.id === row.id ? result.data : r)))
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
        await onSuccess?.()
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

  async function removeSaved(row: PublisherKpi) {
    setSavingKey(`del:${row.id}`)
    try {
      const res = await fetch(`/api/publisher-kpis?id=${encodeURIComponent(String(row.id))}`, {
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
      await onSuccess?.()
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

  function removePending(tempId: string) {
    setPending((p) => p.filter((x) => x.tempId !== tempId))
  }

  if (!publisherKey) {
    return (
      <Card className="w-full rounded-xl border-muted/70">
        <CardHeader>
          <CardTitle>Publisher KPIs</CardTitle>
          <CardDescription>This publisher has no publisher ID; KPIs cannot be saved.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (mediaTypeOptions.length === 0) {
    return (
      <Card className="w-full rounded-xl border-muted/70">
        <CardHeader>
          <CardTitle>Publisher KPIs</CardTitle>
          <CardDescription>
            Enable at least one media type on this publisher to add KPI rows (any number per media type and bid
            strategy).
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const totalRows = sortedSavedRows.length + pending.length
  const showEmpty = !loading && totalRows === 0

  return (
    <Card className="w-full max-w-none rounded-xl border-muted/70 shadow-sm">
      <CardHeader className="border-b border-muted/40 pb-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Publisher KPIs</CardTitle>
              <CardDescription>
                Add as many rows as you need — each is a media type + bid / targeting strategy + metrics. Duplicates
                are allowed if you need them. Syncs to Xano{" "}
                <span className="font-mono text-xs">publisher_kpi</span>.
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

          <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-end">
            <p className="w-full text-xs font-medium text-muted-foreground sm:mb-1 sm:w-auto sm:flex-none">
              Quick fill (one draft per bid strategy)
            </p>
            <div className="grid w-full min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="mb-1 text-xs text-muted-foreground">Media type</p>
                <Combobox
                  options={mediaTypeOptions}
                  value={bulkMediaSlug}
                  onValueChange={setBulkMediaSlug}
                  placeholder="Media type"
                  searchPlaceholder="Search..."
                  emptyText="No results."
                  buttonClassName="h-9 w-full max-w-full"
                  disabled={anySaving}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 w-full shrink-0 sm:w-auto"
                disabled={anySaving || !bulkMediaSlug}
                onClick={addAllBidStrategiesForMedia}
              >
                <Layers className="mr-1 h-4 w-4" />
                Add all strategies
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="w-full pt-4">
        {loading ? (
          <div className="flex w-full flex-col gap-4">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-44 w-full rounded-xl" />
          </div>
        ) : showEmpty ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No KPIs yet. Use <span className="font-medium">Add KPI</span> or{" "}
            <span className="font-medium">Add all strategies</span> to create rows.
          </p>
        ) : (
          <div className="flex max-h-[min(70vh,640px)] w-full flex-col gap-4 overflow-y-auto pr-1">
            {sortedSavedRows.map((row) => {
              const mediaLabel =
                mediaTypeOptions.find((o) => o.value === row.media_type)?.label ?? row.media_type
              return (
                <div
                  key={`saved-${row.id}`}
                  className="flex w-full min-w-0 flex-col rounded-xl border border-border/60 bg-card p-4 shadow-sm"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Saved · {mediaLabel} · ID {row.id}
                    </span>
                    {dirtyIds.has(row.id) ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
                    ) : null}
                  </div>

                  <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Media type</p>
                      <Combobox
                        options={mediaTypeOptions}
                        value={row.media_type}
                        onValueChange={(v) => updateSaved(row.id, { media_type: v, bid_strategy: "" })}
                        placeholder="Media type"
                        searchPlaceholder="Search..."
                        emptyText="No results."
                        buttonClassName="h-8 w-full max-w-full"
                        disabled={anySaving}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Bid strategy / targeting</p>
                      <Combobox
                        options={getBidStrategiesForMediaType(row.media_type)}
                        value={row.bid_strategy}
                        onValueChange={(v) => updateSaved(row.id, { bid_strategy: v })}
                        placeholder="Bid strategy"
                        searchPlaceholder="Search..."
                        emptyText="No options."
                        disabled={!row.media_type || anySaving}
                        buttonClassName="h-8 w-full max-w-full"
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {CLIENT_KPI_METRIC_FIELDS.map((field) => (
                      <div key={field} className="min-w-0 space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          {CLIENT_KPI_METRIC_LABELS[field] ?? field}
                        </label>
                        {PERCENT_KPI_FIELDS.has(field) ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            key={`pub-saved-pct-${row.id}-${field}-${row[field]}`}
                            className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                            defaultValue={formatPercentForInput(row[field])}
                            disabled={anySaving}
                            onBlur={(e) =>
                              updateSaved(row.id, {
                                [field]: parsePercentHeuristic(e.target.value),
                              } as Partial<PublisherKpi>)
                            }
                          />
                        ) : field === "cpv" ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            key={`pub-saved-cpv-${row.id}-${row.cpv}`}
                            className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                            defaultValue={`$${row.cpv.toFixed(4)}`}
                            disabled={anySaving}
                            onBlur={(e) =>
                              updateSaved(row.id, {
                                cpv:
                                  parseFloat(e.target.value.replace(/[^0-9.-]/g, "")) || 0,
                              })
                            }
                          />
                        ) : (
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
                              } as Partial<PublisherKpi>)
                            }
                          />
                        )}
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
                        !rowReady(row.media_type, row.bid_strategy)
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
              )
            })}

            {pending.map((row) => (
              <div
                key={row.tempId}
                className="flex w-full min-w-0 flex-col rounded-xl border border-dashed border-border/80 bg-muted/15 p-4 shadow-sm"
              >
                <div className="mb-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">New KPI</span>
                </div>

                <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Media type</p>
                    <Combobox
                      options={mediaTypeOptions}
                      value={row.media_type}
                      onValueChange={(v) =>
                        updatePending(row.tempId, { media_type: v, bid_strategy: "" })
                      }
                      placeholder="Media type"
                      searchPlaceholder="Search..."
                      emptyText="No results."
                      buttonClassName="h-8 w-full max-w-full"
                      disabled={anySaving}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Bid strategy / targeting</p>
                    <Combobox
                      options={getBidStrategiesForMediaType(row.media_type)}
                      value={row.bid_strategy}
                      onValueChange={(v) => updatePending(row.tempId, { bid_strategy: v })}
                      placeholder="Bid strategy"
                      searchPlaceholder="Search..."
                      emptyText="No options."
                      disabled={!row.media_type || anySaving}
                      buttonClassName="h-8 w-full max-w-full"
                    />
                  </div>
                </div>

                <div className="mt-4 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {CLIENT_KPI_METRIC_FIELDS.map((field) => (
                    <div key={field} className="min-w-0 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {CLIENT_KPI_METRIC_LABELS[field] ?? field}
                      </label>
                      {PERCENT_KPI_FIELDS.has(field) ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          key={`pub-pend-pct-${row.tempId}-${field}-${row[field]}`}
                          className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                          defaultValue={formatPercentForInput(row[field])}
                          disabled={anySaving}
                          onBlur={(e) =>
                            updatePending(row.tempId, {
                              [field]: parsePercentHeuristic(e.target.value),
                            } as Partial<PublisherKpiInput>)
                          }
                        />
                      ) : field === "cpv" ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          key={`pub-pend-cpv-${row.tempId}-${row.cpv}`}
                          className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                          defaultValue={`$${row.cpv.toFixed(4)}`}
                          disabled={anySaving}
                          onBlur={(e) =>
                            updatePending(row.tempId, {
                              cpv:
                                parseFloat(e.target.value.replace(/[^0-9.-]/g, "")) || 0,
                            })
                          }
                        />
                      ) : (
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
                            } as Partial<PublisherKpiInput>)
                          }
                        />
                      )}
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
                      !rowReady(row.media_type, row.bid_strategy)
                    }
                    onClick={() => void savePending(row)}
                  >
                    {savingKey === row.tempId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={anySaving}
                    onClick={() => removePending(row.tempId)}
                  >
                    Discard
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
