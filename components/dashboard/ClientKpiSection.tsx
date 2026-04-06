"use client"

import { useEffect, useMemo, useState } from "react"
import { Layers, Loader2, Plus, Save, Trash2 } from "lucide-react"

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
import {
  filterPublishersWithMediaTypeSlug,
  mediaTypeComboboxOptionsForPublisher,
} from "@/lib/publisher/publisherKpiMediaOptions"
import { formatPercentForInput, parsePercentHeuristic } from "@/lib/kpi/percentMetrics"

const PERCENT_KPI_FIELDS = new Set<string>(["ctr", "vtr", "conversion_rate"])

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

function emptyPendingRow(
  clientName: string,
  tempId: string,
  overrides?: Partial<ClientKpiInput>,
): PendingRow {
  return {
    tempId,
    mp_client_name: clientName.trim(),
    publisher_name: "",
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

function rowKey(
  publisher_name: string,
  media_type: string,
  bid_strategy: string,
): string {
  return `${publisher_name}\0${media_type}\0${bid_strategy}`
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
  const clientKey = clientName.trim()

  const [rows, setRows] = useState<ClientKpi[]>([])
  const [pending, setPending] = useState<PendingRow[]>([])
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [loading, setLoading] = useState(true)
  const [dirtyIds, setDirtyIds] = useState<Set<number>>(new Set())
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [bulkPublisherName, setBulkPublisherName] = useState("")
  const [bulkMediaSlug, setBulkMediaSlug] = useState("")

  const savingAll = savingKey === "__all__"
  const anySaving = savingKey !== null

  const publisherOptions = useMemo(
    () =>
      publishers
        .map((p) => ({
          value: p.publisher_name || "",
          label: p.publisher_name || `Publisher ${p.id}`,
        }))
        .filter((o) => o.value !== ""),
    [publishers],
  )

  const selectedBulkPublisher = useMemo(
    () => publishers.find((p) => (p.publisher_name || "") === bulkPublisherName),
    [publishers, bulkPublisherName],
  )

  /** Media types allowed for the quick-fill publisher (all options if none selected yet). */
  const bulkMediaTypeOptions = useMemo(() => {
    if (selectedBulkPublisher) {
      return mediaTypeComboboxOptionsForPublisher(selectedBulkPublisher)
    }
    return MEDIA_TYPE_OPTIONS
  }, [selectedBulkPublisher])

  /** Publishers that support the quick-fill media type (all if no media selected). */
  const bulkPublisherOptionsFiltered = useMemo(() => {
    if (!bulkMediaSlug.trim()) return publisherOptions
    const pubs = filterPublishersWithMediaTypeSlug(publishers, bulkMediaSlug)
    return pubs
      .map((p) => ({
        value: p.publisher_name || "",
        label: p.publisher_name || `Publisher ${p.id}`,
      }))
      .filter((o) => o.value !== "")
  }, [bulkMediaSlug, publisherOptions, publishers])

  useEffect(() => {
    if (bulkMediaTypeOptions.length === 0) return
    if (
      !bulkMediaSlug ||
      !bulkMediaTypeOptions.some((o) => o.value === bulkMediaSlug)
    ) {
      setBulkMediaSlug(bulkMediaTypeOptions[0].value)
    }
  }, [bulkMediaTypeOptions, bulkMediaSlug])

  useEffect(() => {
    if (bulkPublisherOptionsFiltered.length === 0) return
    if (
      !bulkPublisherName ||
      !bulkPublisherOptionsFiltered.some((o) => o.value === bulkPublisherName)
    ) {
      setBulkPublisherName(bulkPublisherOptionsFiltered[0].value)
    }
  }, [bulkPublisherOptionsFiltered, bulkPublisherName])

  const existingTripleKeys = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) {
      if (rowReady(r.publisher_name, r.media_type, r.bid_strategy)) {
        s.add(rowKey(r.publisher_name, r.media_type, r.bid_strategy))
      }
    }
    for (const p of pending) {
      if (rowReady(p.publisher_name, p.media_type, p.bid_strategy)) {
        s.add(rowKey(p.publisher_name, p.media_type, p.bid_strategy))
      }
    }
    return s
  }, [rows, pending])

  const pendingReady = useMemo(
    () =>
      pending.filter((r) =>
        rowReady(r.publisher_name, r.media_type, r.bid_strategy),
      ),
    [pending],
  )

  const dirtyReady = useMemo(
    () =>
      rows.filter(
        (r) =>
          dirtyIds.has(r.id) &&
          rowReady(r.publisher_name, r.media_type, r.bid_strategy),
      ),
    [rows, dirtyIds],
  )

  const canSaveAll = pendingReady.length > 0 || dirtyReady.length > 0

  const sortedSavedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const pub = a.publisher_name.localeCompare(b.publisher_name)
      if (pub !== 0) return pub
      const mt = a.media_type.localeCompare(b.media_type)
      if (mt !== 0) return mt
      const bs = a.bid_strategy.localeCompare(b.bid_strategy)
      if (bs !== 0) return bs
      return a.id - b.id
    })
  }, [rows])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const pubPromise = fetch("/api/publishers")
        const kpisPromise = clientKey
          ? fetch(`/api/client-kpis?mp_client_name=${encodeURIComponent(clientKey)}`)
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
  }, [clientName, urlSlug, clientKey])

  function markDirty(id: number) {
    setDirtyIds((s) => new Set(s).add(id))
  }

  function updateSaved(id: number, patch: Partial<ClientKpi>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    markDirty(id)
  }

  function updatePending(tempId: string, patch: Partial<ClientKpiInput>) {
    setPending((prev) =>
      prev.map((r) =>
        r.tempId === tempId
          ? { ...r, ...patch, mp_client_name: clientKey || r.mp_client_name }
          : r,
      ),
    )
  }

  function publisherComboOptionsForMediaSlug(mediaSlug: string) {
    if (!mediaSlug.trim()) return publisherOptions
    const pubs = filterPublishersWithMediaTypeSlug(publishers, mediaSlug)
    return pubs
      .map((p) => ({
        value: p.publisher_name || "",
        label: p.publisher_name || `Publisher ${p.id}`,
      }))
      .filter((o) => o.value !== "")
  }

  function mediaTypeOptionsForPublisherName(pubName: string) {
    const pub = publishers.find((p) => (p.publisher_name || "") === pubName)
    if (pub) return mediaTypeComboboxOptionsForPublisher(pub)
    return MEDIA_TYPE_OPTIONS
  }

  function updateSavedPublisher(id: number, name: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const pub = publishers.find((p) => (p.publisher_name || "") === name)
        let next: ClientKpi = { ...r, publisher_name: name }
        if (pub) {
          const allowed = new Set(
            mediaTypeComboboxOptionsForPublisher(pub).map((o) => o.value),
          )
          if (r.media_type && !allowed.has(r.media_type)) {
            next = { ...next, media_type: "", bid_strategy: "" }
          }
        }
        return next
      }),
    )
    markDirty(id)
  }

  function updateSavedMedia(id: number, mediaSlug: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const allowedNames = new Set(
          filterPublishersWithMediaTypeSlug(publishers, mediaSlug).map(
            (p) => p.publisher_name || "",
          ),
        )
        let next: ClientKpi = { ...r, media_type: mediaSlug, bid_strategy: "" }
        if (r.publisher_name && !allowedNames.has(r.publisher_name)) {
          next.publisher_name = ""
        }
        return next
      }),
    )
    markDirty(id)
  }

  function updatePendingPublisher(tempId: string, name: string) {
    setPending((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r
        const pub = publishers.find((p) => (p.publisher_name || "") === name)
        let next: PendingRow = {
          ...r,
          publisher_name: name,
          mp_client_name: clientKey || r.mp_client_name,
        }
        if (pub) {
          const allowed = new Set(
            mediaTypeComboboxOptionsForPublisher(pub).map((o) => o.value),
          )
          if (r.media_type && !allowed.has(r.media_type)) {
            next = { ...next, media_type: "", bid_strategy: "" }
          }
        }
        return next
      }),
    )
  }

  function updatePendingMedia(tempId: string, mediaSlug: string) {
    setPending((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r
        const allowedNames = new Set(
          filterPublishersWithMediaTypeSlug(publishers, mediaSlug).map(
            (p) => p.publisher_name || "",
          ),
        )
        let next: PendingRow = {
          ...r,
          media_type: mediaSlug,
          bid_strategy: "",
          mp_client_name: clientKey || r.mp_client_name,
        }
        if (r.publisher_name && !allowedNames.has(r.publisher_name)) {
          next.publisher_name = ""
        }
        return next
      }),
    )
  }

  function addKpiRow() {
    if (!clientKey) return
    setPending((p) => [...p, emptyPendingRow(clientName, crypto.randomUUID())])
  }

  function addAllBidStrategiesForPublisherAndMedia() {
    if (!clientKey) {
      toast({
        title: "No client",
        description: "Client name is required to add KPI rows.",
        variant: "destructive",
      })
      return
    }
    if (!bulkPublisherName || !bulkMediaSlug) {
      toast({
        title: "Pick publisher and media type",
        description: "Choose both before adding all bid strategies.",
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
      const k = rowKey(bulkPublisherName, bulkMediaSlug, opt.value)
      if (existingTripleKeys.has(k)) continue
      toAdd.push(
        emptyPendingRow(clientName, crypto.randomUUID(), {
          publisher_name: bulkPublisherName,
          media_type: bulkMediaSlug,
          bid_strategy: opt.value,
        }),
      )
    }
    if (toAdd.length === 0) {
      toast({
        title: "Already covered",
        description:
          "Every bid strategy for this publisher + media type already has a row (saved or draft).",
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

  function removePending(tempId: string) {
    setPending((p) => p.filter((x) => x.tempId !== tempId))
  }

  if (!clientKey) {
    return (
      <Card className="w-full rounded-xl border-muted/70">
        <CardHeader>
          <CardTitle>Client KPIs</CardTitle>
          <CardDescription>
            A client name is required to load and save KPI rows to Xano{" "}
            <span className="font-mono text-xs">client_kpi</span>.
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
              <CardTitle>Client KPIs</CardTitle>
              <CardDescription>
                Benchmarks for <span className="font-medium text-foreground">{clientKey}</span> — publisher, media
                type, bid / targeting, and metrics. Add any number of rows. Publisher and media pickers are linked:
                choosing a publisher limits media types to that publisher&apos;s channels; choosing a media type first
                limits publishers to those who offer it. Syncs to Xano{" "}
                <span className="font-mono text-xs">client_kpi</span> (<span className="font-mono text-xs">mp_client_name</span>{" "}
                is set automatically).
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

          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Quick fill (one draft per bid strategy for a publisher + media type). Lists stay in sync.
            </p>
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
              <div className="min-w-0">
                <p className="mb-1 text-xs text-muted-foreground">Publisher</p>
                <Combobox
                  options={bulkPublisherOptionsFiltered}
                  value={bulkPublisherName}
                  onValueChange={setBulkPublisherName}
                  placeholder="Publisher"
                  searchPlaceholder="Search publishers..."
                  emptyText={
                    bulkMediaSlug.trim()
                      ? "No publishers offer this media type."
                      : "No publishers found."
                  }
                  buttonClassName="h-9 w-full max-w-full"
                  disabled={anySaving || bulkPublisherOptionsFiltered.length === 0}
                />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-xs text-muted-foreground">Media type</p>
                <Combobox
                  options={bulkMediaTypeOptions}
                  value={bulkMediaSlug}
                  onValueChange={setBulkMediaSlug}
                  placeholder="Media type"
                  searchPlaceholder="Search..."
                  emptyText={
                    selectedBulkPublisher
                      ? "No media types enabled for this publisher."
                      : "No results."
                  }
                  buttonClassName="h-9 w-full max-w-full"
                  disabled={anySaving || bulkMediaTypeOptions.length === 0}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 w-full shrink-0 lg:w-auto"
                disabled={
                  anySaving ||
                  !bulkPublisherName ||
                  !bulkMediaSlug ||
                  bulkPublisherOptionsFiltered.length === 0 ||
                  bulkMediaTypeOptions.length === 0
                }
                onClick={addAllBidStrategiesForPublisherAndMedia}
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
                MEDIA_TYPE_OPTIONS.find((o) => o.value === row.media_type)?.label ?? row.media_type
              return (
                <div
                  key={`saved-${row.id}`}
                  className="flex w-full min-w-0 flex-col rounded-xl border border-border/60 bg-card p-4 shadow-sm"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Saved · {row.publisher_name || "—"} · {mediaLabel} · ID {row.id}
                    </span>
                    {dirtyIds.has(row.id) ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
                    ) : null}
                  </div>

                  <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="min-w-0 xl:col-span-1">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Publisher</p>
                      <Combobox
                        options={publisherComboOptionsForMediaSlug(row.media_type)}
                        value={row.publisher_name}
                        onValueChange={(v) => updateSavedPublisher(row.id, v)}
                        placeholder="Publisher"
                        searchPlaceholder="Search publishers..."
                        emptyText={
                          row.media_type.trim()
                            ? "No publishers offer this media type."
                            : "No publishers found."
                        }
                        buttonClassName="h-8 w-full max-w-full"
                        disabled={anySaving}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Media type</p>
                      <Combobox
                        options={mediaTypeOptionsForPublisherName(row.publisher_name)}
                        value={row.media_type}
                        onValueChange={(v) => updateSavedMedia(row.id, v)}
                        placeholder="Media type"
                        searchPlaceholder="Search..."
                        emptyText={
                          row.publisher_name.trim()
                            ? "No media types for this publisher."
                            : "No results."
                        }
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
                            key={`saved-pct-${row.id}-${field}-${row[field]}`}
                            className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                            defaultValue={formatPercentForInput(row[field])}
                            disabled={anySaving}
                            onBlur={(e) =>
                              updateSaved(row.id, {
                                [field]: parsePercentHeuristic(e.target.value),
                              } as Partial<ClientKpi>)
                            }
                          />
                        ) : field === "cpv" ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            key={`saved-cpv-${row.id}-${row.cpv}`}
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
                              } as Partial<ClientKpi>)
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
                        !rowReady(row.publisher_name, row.media_type, row.bid_strategy)
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

                <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Publisher</p>
                    <Combobox
                      options={publisherComboOptionsForMediaSlug(row.media_type)}
                      value={row.publisher_name}
                      onValueChange={(v) => updatePendingPublisher(row.tempId, v)}
                      placeholder="Publisher"
                      searchPlaceholder="Search publishers..."
                      emptyText={
                        row.media_type.trim()
                          ? "No publishers offer this media type."
                          : "No publishers found."
                      }
                      buttonClassName="h-8 w-full max-w-full"
                      disabled={anySaving}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Media type</p>
                    <Combobox
                      options={mediaTypeOptionsForPublisherName(row.publisher_name)}
                      value={row.media_type}
                      onValueChange={(v) => updatePendingMedia(row.tempId, v)}
                      placeholder="Media type"
                      searchPlaceholder="Search..."
                      emptyText={
                        row.publisher_name.trim()
                          ? "No media types for this publisher."
                          : "No results."
                      }
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
                          key={`pend-pct-${row.tempId}-${field}-${row[field]}`}
                          className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                          defaultValue={formatPercentForInput(row[field])}
                          disabled={anySaving}
                          onBlur={(e) =>
                            updatePending(row.tempId, {
                              [field]: parsePercentHeuristic(e.target.value),
                            } as Partial<ClientKpiInput>)
                          }
                        />
                      ) : field === "cpv" ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          key={`pend-cpv-${row.tempId}-${row.cpv}`}
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
                            } as Partial<ClientKpiInput>)
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
                      !rowReady(row.publisher_name, row.media_type, row.bid_strategy)
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
