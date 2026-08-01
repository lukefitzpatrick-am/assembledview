"use client"

import { useEffect, useMemo, useState } from "react"
import { Info, Layers, Loader2, Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Combobox } from "@/components/ui/combobox"
import { EmptyState, LoadingState } from "@/components/ui/states"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/use-toast"
import {
  clientKpiMediaTypeLabel,
  groupClientKpisByMediaType,
  resolveClientKpiGroupSlug,
} from "@/lib/kpi/clientKpiMediaOrder"
import {
  type ClientKpi,
  type ClientKpiInput,
  CLIENT_KPI_METRIC_FIELDS,
  CLIENT_KPI_METRIC_LABELS,
  getBidStrategiesForMediaType,
  MEDIA_TYPE_OPTIONS,
} from "@/lib/kpi/types"
import type { Publisher } from "@/lib/types/publisher"
import {
  filterPublishersWithMediaTypeSlug,
  mediaTypeComboboxOptionsForPublisher,
} from "@/lib/publisher/publisherKpiMediaOptions"
import { formatPercentForInput, parsePercentHeuristic } from "@/lib/kpi/metrics"

const PERCENT_KPI_FIELDS = new Set<string>(["ctr", "vtr", "conversion_rate"])
const OTHER_GROUP_SLUG = "__other__"

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
    const res = await fetch("/api/kpis/client", {
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
    const res = await fetch("/api/kpis/client", {
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

function sortGroupedItems<
  T extends { kind: "saved"; row: ClientKpi } | { kind: "pending"; row: PendingRow },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pub = a.row.publisher_name.localeCompare(b.row.publisher_name)
    if (pub !== 0) return pub
    const bs = a.row.bid_strategy.localeCompare(b.row.bid_strategy)
    if (bs !== 0) return bs
    if (a.kind === "saved" && b.kind === "saved") return a.row.id - b.row.id
    if (a.kind === "pending" && b.kind === "pending") {
      return a.row.tempId.localeCompare(b.row.tempId)
    }
    return a.kind === "saved" ? -1 : 1
  })
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
  /** Quick-fill publisher per media-type group slug. */
  const [bulkPublisherByMedia, setBulkPublisherByMedia] = useState<Record<string, string>>({})
  /** Controlled accordion — empty groups start collapsed; non-empty open after load. */
  const [openGroups, setOpenGroups] = useState<string[] | null>(null)

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

  const mediaGroups = useMemo(() => {
    type Item =
      | { kind: "saved"; row: ClientKpi; media_type: string }
      | { kind: "pending"; row: PendingRow; media_type: string }
    const tagged: Item[] = [
      ...rows.map((row) => ({ kind: "saved" as const, row, media_type: row.media_type })),
      ...pending.map((row) => ({
        kind: "pending" as const,
        row,
        media_type: row.media_type,
      })),
    ]
    const buckets = groupClientKpisByMediaType(tagged, OTHER_GROUP_SLUG)
    return buckets.map((b, index) => {
      const prev = index > 0 ? buckets[index - 1] : null
      const showBandLabel =
        b.slug !== OTHER_GROUP_SLUG && (!prev || prev.band !== b.band)
      return {
        slug: b.slug,
        label: b.label,
        band: b.band,
        showBandLabel,
        items: sortGroupedItems(
          b.items.map((item) =>
            item.kind === "saved"
              ? { kind: "saved" as const, row: item.row }
              : { kind: "pending" as const, row: item.row },
          ),
        ),
      }
    })
  }, [rows, pending])

  const totalRows = rows.length + pending.length

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setOpenGroups(null)
      try {
        const pubPromise = fetch("/api/publishers")
        const kpisPromise = clientKey
          ? fetch(`/api/kpis/client?mp_client_name=${encodeURIComponent(clientKey)}`)
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

  // After load, open groups that already have rows; leave empty collapsed.
  useEffect(() => {
    if (loading || openGroups !== null) return
    const withContent = mediaGroups.filter((g) => g.items.length > 0).map((g) => g.slug)
    setOpenGroups(withContent)
  }, [loading, openGroups, mediaGroups])

  function ensureGroupOpen(slug: string) {
    setOpenGroups((prev) => {
      const base = prev ?? []
      return base.includes(slug) ? base : [...base, slug]
    })
  }

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
    const group = resolveClientKpiGroupSlug(mediaSlug)
    if (group) ensureGroupOpen(group)
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
    const group = resolveClientKpiGroupSlug(mediaSlug)
    if (group) ensureGroupOpen(group)
  }

  function addKpiRowForMedia(mediaSlug: string) {
    if (!clientKey) return
    if (mediaSlug === OTHER_GROUP_SLUG) {
      setPending((p) => [...p, emptyPendingRow(clientName, crypto.randomUUID())])
      ensureGroupOpen(OTHER_GROUP_SLUG)
      return
    }
    setPending((p) => [
      ...p,
      emptyPendingRow(clientName, crypto.randomUUID(), { media_type: mediaSlug }),
    ])
    ensureGroupOpen(mediaSlug)
  }

  function addAllBidStrategiesForMedia(mediaSlug: string) {
    if (!clientKey) {
      toast({
        title: "No client",
        description: "Client name is required to add KPI rows.",
        variant: "destructive",
      })
      return
    }
    const publisherName = (bulkPublisherByMedia[mediaSlug] || "").trim()
    if (!publisherName || !mediaSlug || mediaSlug === OTHER_GROUP_SLUG) {
      toast({
        title: "Pick a publisher",
        description: "Choose a publisher before adding all bid strategies.",
        variant: "destructive",
      })
      return
    }
    const strategies = getBidStrategiesForMediaType(mediaSlug)
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
      const k = rowKey(publisherName, mediaSlug, opt.value)
      if (existingTripleKeys.has(k)) continue
      toAdd.push(
        emptyPendingRow(clientName, crypto.randomUUID(), {
          publisher_name: publisherName,
          media_type: mediaSlug,
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
    ensureGroupOpen(mediaSlug)
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
      const res = await fetch(`/api/kpis/client?id=${encodeURIComponent(String(row.id))}`, {
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
          <CardDescription>A client name is required to load and save KPI rows.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  function renderSavedRow(row: ClientKpi) {
    const mediaLabel =
      MEDIA_TYPE_OPTIONS.find((o) => o.value === row.media_type)?.label ??
      clientKpiMediaTypeLabel(row.media_type) ??
      row.media_type
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
            <span className="text-xs text-status-behind-fg">Unsaved changes</span>
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
                  defaultValue={`$${(row.cpv ?? 0).toFixed(4)}`}
                  disabled={anySaving}
                  onBlur={(e) =>
                    updateSaved(row.id, {
                      cpv: parseFloat(e.target.value.replace(/[^0-9.-]/g, "")) || 0,
                    })
                  }
                />
              ) : (
                <input
                  type="number"
                  step="0.000001"
                  min={0}
                  className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                  value={row[field] ?? ""}
                  disabled={anySaving}
                  onChange={(e) =>
                    updateSaved(row.id, {
                      [field]: parseMetric(e.target.value, row[field] ?? 0),
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
  }

  function renderPendingRow(row: PendingRow) {
    return (
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
                  defaultValue={`$${(row.cpv ?? 0).toFixed(4)}`}
                  disabled={anySaving}
                  onBlur={(e) =>
                    updatePending(row.tempId, {
                      cpv: parseFloat(e.target.value.replace(/[^0-9.-]/g, "")) || 0,
                    })
                  }
                />
              ) : (
                <input
                  type="number"
                  step="0.000001"
                  min={0}
                  className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                  value={row[field] ?? ""}
                  disabled={anySaving}
                  onChange={(e) =>
                    updatePending(row.tempId, {
                      [field]: parseMetric(e.target.value, row[field] ?? 0),
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
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="w-full max-w-none rounded-xl border-muted/70 shadow-sm">
        <CardHeader className="border-b border-muted/40 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle>Client KPIs</CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Storage details"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Persisted as client_kpi (mp_client_name set automatically). Writes remain on Xano until
                    cutover.
                  </TooltipContent>
                </Tooltip>
              </div>
              <CardDescription>
                Benchmarks for <span className="font-medium text-foreground">{clientKey}</span> — grouped by
                media type (digital first). Publisher and media pickers stay linked; Add KPI inside a group
                pre-selects that channel.
              </CardDescription>
            </div>
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
          </div>
        </CardHeader>
        <CardContent className="w-full pt-4">
          {loading || openGroups === null ? (
            <LoadingState rows={4} className="border-0 bg-transparent p-0 shadow-none" />
          ) : (
            <div className="flex max-h-[min(70vh,640px)] w-full flex-col gap-2 overflow-y-auto pr-1">
              {totalRows === 0 ? (
                <EmptyState
                  className="mb-2 border-0 bg-transparent py-6"
                  title="No KPIs yet"
                  message="Expand a media type below to add rows or quick-fill all bid strategies."
                />
              ) : null}

              <Accordion
                type="multiple"
                value={openGroups}
                onValueChange={setOpenGroups}
                className="w-full"
              >
                {mediaGroups.map((group) => {
                  const count = group.items.length
                  const isCanonical = group.slug !== OTHER_GROUP_SLUG
                  const publisherOpts = isCanonical
                    ? publisherComboOptionsForMediaSlug(group.slug)
                    : publisherOptions
                  const bulkPublisher = bulkPublisherByMedia[group.slug] ?? ""

                  return (
                    <div key={group.slug}>
                      {group.showBandLabel ? (
                        <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground first:mt-0">
                          {group.band === "digital" ? "Digital" : "Broadcast, print & other"}
                        </p>
                      ) : null}
                      <AccordionItem value={group.slug} className="border-border/60">
                        <AccordionTrigger className="py-3 text-sm hover:no-underline">
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{group.label}</span>
                            <span className="num rounded-pill bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              {count}
                            </span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3">
                          {isCanonical ? (
                            <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                              <p className="text-xs font-medium text-muted-foreground">
                                Quick fill — one draft per bid strategy for this media type.
                              </p>
                              <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                <div className="min-w-0">
                                  <p className="mb-1 text-xs text-muted-foreground">Publisher</p>
                                  <Combobox
                                    options={publisherOpts}
                                    value={bulkPublisher}
                                    onValueChange={(v) =>
                                      setBulkPublisherByMedia((prev) => ({
                                        ...prev,
                                        [group.slug]: v,
                                      }))
                                    }
                                    placeholder="Publisher"
                                    searchPlaceholder="Search publishers..."
                                    emptyText="No publishers offer this media type."
                                    buttonClassName="h-9 w-full max-w-full"
                                    disabled={anySaving || publisherOpts.length === 0}
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="h-9 w-full shrink-0 sm:w-auto"
                                  disabled={
                                    anySaving || !bulkPublisher || publisherOpts.length === 0
                                  }
                                  onClick={() => addAllBidStrategiesForMedia(group.slug)}
                                >
                                  <Layers className="mr-1 h-4 w-4" />
                                  Add all strategies
                                </Button>
                              </div>
                            </div>
                          ) : null}

                          <div className="flex flex-wrap justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => addKpiRowForMedia(group.slug)}
                              disabled={anySaving}
                            >
                              <Plus className="mr-1 h-4 w-4" />
                              Add KPI
                            </Button>
                          </div>

                          {group.items.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No rows in this group yet.</p>
                          ) : (
                            <div className="flex flex-col gap-4">
                              {group.items.map((item) =>
                                item.kind === "saved"
                                  ? renderSavedRow(item.row)
                                  : renderPendingRow(item.row),
                              )}
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </div>
                  )
                })}
              </Accordion>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
