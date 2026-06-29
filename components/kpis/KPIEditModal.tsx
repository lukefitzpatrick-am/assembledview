"use client"

import * as React from "react"
import {
  CLIENT_KPI_METRIC_FIELDS,
  CLIENT_KPI_METRIC_LABELS,
  type PublisherKpiInput,
  type ResolvedKPIRow,
} from "@/lib/kpi/types"
import type { Publisher } from "@/lib/types/publisher"
import { MEDIA_TYPE_LABELS } from "@/lib/media/mediaTypes"
import { recalcRow } from "@/lib/kpi/recalc"
import { formatPercentForInput, parsePercentHeuristic } from "@/lib/kpi/metrics"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Loader2, X } from "lucide-react"
import type { KpiHost } from "./kpiHost"

export interface KPIEditModalProps {
  open: boolean
  onClose: () => void
  host: KpiHost
  publishers?: Publisher[]
  onPublisherKpiAdded?: () => void | Promise<void>
}

const audFmt = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })
const numAuFmt = new Intl.NumberFormat("en-AU")

const headerCell =
  "sticky top-0 z-10 bg-background text-[10px] font-semibold uppercase tracking-wider text-muted-foreground h-8 px-2 border-b border-border/40 shadow-[0_1px_0_0_hsl(var(--border))]"

const inputClass =
  "w-full text-right bg-transparent border border-border/30 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary text-[11px]"

type PublisherKpiMetricFormValues = Record<
  "ctr" | "cpv" | "conversion_rate" | "vtr" | "frequency",
  string
>

type PublisherKpiCreateDraft = {
  body: PublisherKpiInput
  resolvedByPublisherId: boolean
}

function normPublisher(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
}

function parsePlainMetric(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, "").trim()
  if (!cleaned) return 0
  const parsed = parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function parsePercentMetric(raw: string): number {
  return parsePercentHeuristic(raw) ?? 0
}

function publisherKpiMetricFormValuesFromRow(row: ResolvedKPIRow): PublisherKpiMetricFormValues {
  return {
    ctr: formatPercentForInput(row.ctr),
    cpv: row.cpv === null ? "" : row.cpv.toFixed(4),
    conversion_rate: formatPercentForInput(row.conversion_rate),
    vtr: formatPercentForInput(row.vtr),
    frequency: row.frequency === null ? "" : row.frequency.toFixed(1),
  }
}

function resolvePublisherForPublisherKpi(
  row: ResolvedKPIRow,
  publishers: Publisher[] = [],
): { publisher: string; resolvedByPublisherId: boolean } {
  const rowPublisher = normPublisher(row.publisher)
  const match = publishers.find((p) => normPublisher(p.publisher_name) === rowPublisher)
  const publisherId = String(match?.publisherid ?? "").trim()
  if (publisherId) {
    return { publisher: publisherId, resolvedByPublisherId: true }
  }
  return { publisher: row.publisher, resolvedByPublisherId: false }
}

export function buildPublisherKpiCreateBody(
  row: ResolvedKPIRow,
  publishers: Publisher[] = [],
  metrics: PublisherKpiMetricFormValues,
): PublisherKpiCreateDraft {
  const resolvedPublisher = resolvePublisherForPublisherKpi(row, publishers)
  return {
    resolvedByPublisherId: resolvedPublisher.resolvedByPublisherId,
    body: {
      publisher: resolvedPublisher.publisher,
      media_type: row.media_type,
      bid_strategy: row.bid_strategy,
      ctr: parsePercentMetric(metrics.ctr),
      cpv: parsePlainMetric(metrics.cpv),
      conversion_rate: parsePercentMetric(metrics.conversion_rate),
      vtr: parsePercentMetric(metrics.vtr),
      frequency: parsePlainMetric(metrics.frequency),
    },
  }
}

function sourceBadgeClass(source: ResolvedKPIRow["source"]): string {
  switch (source) {
    case "client":
      return "bg-blue-100 text-blue-700 border-transparent"
    case "publisher":
      return "bg-slate-100 text-slate-600 border-transparent"
    case "saved":
      return "bg-green-100 text-green-700 border-transparent"
    case "manual":
      return "bg-amber-100 text-amber-700 border-transparent"
    case "default":
    default:
      return "bg-red-50 text-red-400 border-transparent"
  }
}

function uniqueMediaTypesInOrder(rows: ResolvedKPIRow[]): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (!seen.has(r.media_type)) {
      seen.add(r.media_type)
      order.push(r.media_type)
    }
  }
  return order
}

function groupByMediaType(
  indexed: { row: ResolvedKPIRow; index: number }[],
): { mediaType: string; entries: { row: ResolvedKPIRow; index: number }[] }[] {
  const order: string[] = []
  const map = new Map<string, { row: ResolvedKPIRow; index: number }[]>()
  for (const entry of indexed) {
    const key = entry.row.media_type
    if (!map.has(key)) {
      order.push(key)
      map.set(key, [])
    }
    map.get(key)!.push(entry)
  }
  return order.map((mediaType) => ({ mediaType, entries: map.get(mediaType)! }))
}

export function KPIEditModal({
  open,
  onClose,
  host,
  publishers = [],
  onPublisherKpiAdded,
}: KPIEditModalProps) {
  const { toast } = useToast()
  const { rows: kpiRows, isSaving, onSave, onReset } = host
  const [editedRows, setEditedRows] = React.useState<ResolvedKPIRow[]>([])
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<number, Partial<Record<"ctr" | "vtr" | "cpv" | "conversion_rate" | "frequency", string>>>
  >({})
  const [filterMediaType, setFilterMediaType] = React.useState("all")
  const [showSourceFilter, setShowSourceFilter] = React.useState("all")
  const [publisherKpiDraftRowId, setPublisherKpiDraftRowId] = React.useState<string | null>(null)
  const [publisherKpiMetrics, setPublisherKpiMetrics] =
    React.useState<PublisherKpiMetricFormValues>({
      ctr: "",
      cpv: "",
      conversion_rate: "",
      vtr: "",
      frequency: "",
    })
  const [publisherKpiSavingRowId, setPublisherKpiSavingRowId] = React.useState<string | null>(null)
  const [publisherKpiRefreshToken, setPublisherKpiRefreshToken] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    setEditedRows([...kpiRows])
    setFieldErrors({})
    setPublisherKpiDraftRowId(null)
    setPublisherKpiSavingRowId(null)
    // The modal intentionally snapshots kpiRows when it opens and ignores
    // subsequent external updates to the rows reference. Including kpiRows
    // in the dependency array causes parent re-renders to clobber the
    // user's in-progress edits. See Stage 2e-1-fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  React.useEffect(() => {
    if (!open || publisherKpiRefreshToken === 0) return
    setEditedRows([...kpiRows])
    setFieldErrors({})
  }, [kpiRows, open, publisherKpiRefreshToken])

  const handleFieldChange = React.useCallback(
    (
      rowIndex: number,
      field: "ctr" | "vtr" | "cpv" | "conversion_rate" | "frequency",
      value: number | null,
    ) => {
      setEditedRows((prev) => {
        const copy = [...prev]
        const row = {
          ...copy[rowIndex],
          [field]: value,
          isManuallyEdited: true,
          source: "manual" as const,
        }
        copy[rowIndex] = recalcRow(row)
        return copy
      })
    },
    [],
  )

  const mediaTypeOptions = React.useMemo(
    () => uniqueMediaTypesInOrder(editedRows),
    [editedRows],
  )

  const filteredIndexed = React.useMemo(() => {
    return editedRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        if (filterMediaType !== "all" && row.media_type !== filterMediaType) return false
        if (showSourceFilter !== "all" && row.source !== showSourceFilter) return false
        return true
      })
  }, [editedRows, filterMediaType, showSourceFilter])

  const groups = React.useMemo(() => groupByMediaType(filteredIndexed), [filteredIndexed])

  const summaryMediaTypeCount = React.useMemo(() => {
    const s = new Set(filteredIndexed.map(({ row }) => row.media_type))
    return s.size
  }, [filteredIndexed])

  function openPublisherKpiDraft(row: ResolvedKPIRow) {
    setPublisherKpiDraftRowId(row.lineItemId)
    setPublisherKpiMetrics(publisherKpiMetricFormValuesFromRow(row))
  }

  function updatePublisherKpiMetric(
    field: keyof PublisherKpiMetricFormValues,
    value: string,
  ) {
    setPublisherKpiMetrics((prev) => ({ ...prev, [field]: value }))
  }

  async function savePublisherKpi(row: ResolvedKPIRow) {
    const draft = buildPublisherKpiCreateBody(row, publishers, publisherKpiMetrics)
    setPublisherKpiSavingRowId(row.lineItemId)
    try {
      const res = await fetch("/api/kpis/publisher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.body),
      })
      if (!res.ok) {
        const errorText = await res.text().catch(() => res.statusText)
        toast({
          title: "Publisher KPI not saved",
          description: errorText || res.statusText,
          variant: "destructive",
        })
        return
      }
      await onPublisherKpiAdded?.()
      setPublisherKpiRefreshToken((t) => t + 1)
      setPublisherKpiDraftRowId(null)
      toast({
        title: "Publisher KPI added",
        description: draft.resolvedByPublisherId
          ? "Saved to publisher_kpi using the publisher ID."
          : "Saved to publisher_kpi using the row publisher name.",
      })
    } catch (e) {
      toast({
        title: "Publisher KPI not saved",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setPublisherKpiSavingRowId(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        className={cn(
          "flex max-h-[92vh] w-[95vw] max-w-7xl flex-col gap-0 overflow-hidden p-0 sm:max-w-7xl",
          "[&>button.absolute]:hidden",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex shrink-0 items-start justify-between gap-4 border-b px-4 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <DialogTitle className="text-left text-lg font-semibold">
                Edit Campaign KPIs
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={filterMediaType} onValueChange={setFilterMediaType}>
                  <SelectTrigger className="h-9 w-[200px] text-xs">
                    <SelectValue placeholder="Media type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All media types</SelectItem>
                    {mediaTypeOptions.map((mt) => (
                      <SelectItem key={mt} value={mt}>
                        {MEDIA_TYPE_LABELS[mt] ?? mt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={showSourceFilter} onValueChange={setShowSourceFilter}>
                  <SelectTrigger className="h-9 w-[180px] text-xs">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    <SelectItem value="client">client</SelectItem>
                    <SelectItem value="publisher">publisher</SelectItem>
                    <SelectItem value="saved">saved</SelectItem>
                    <SelectItem value="manual">manual</SelectItem>
                    <SelectItem value="default">default</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {filteredIndexed.length} KPI rows across {summaryMediaTypeCount} media types
              </p>
            </div>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" className="shrink-0">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {editedRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <p className="text-sm text-muted-foreground">
                  No KPI rows yet. Add line items to your media plan to generate KPIs.
                </p>
              </div>
            ) : filteredIndexed.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <p className="text-sm text-muted-foreground">
                  No rows match the current filters.
                </p>
              </div>
            ) : (
              <table className="w-full border-collapse text-[11px] tabular-nums">
                <thead>
                  <tr>
                    <th className={cn(headerCell, "text-left")}>Media Type</th>
                    <th className={cn(headerCell, "text-left")}>Publisher</th>
                    <th className={cn(headerCell, "text-left")}>Creative / Targeting</th>
                    <th className={cn(headerCell, "text-left")}>Buy Type</th>
                    <th className={cn(headerCell, "text-right")}>Spend</th>
                    <th className={cn(headerCell, "text-right")}>Deliverables</th>
                    <th className={cn(headerCell, "text-right")}>CTR</th>
                    <th className={cn(headerCell, "text-right")}>VTR</th>
                    <th className={cn(headerCell, "text-right")}>CPV</th>
                    <th className={cn(headerCell, "text-right")}>Conv Rate</th>
                    <th className={cn(headerCell, "text-right")}>Freq</th>
                    <th className={cn(headerCell, "text-right")}>Est. Clicks</th>
                    <th className={cn(headerCell, "text-right")}>Est. Views</th>
                    <th className={cn(headerCell, "text-right")}>Est. Reach</th>
                    <th className={cn(headerCell, "text-left")}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(({ mediaType, entries }) => (
                    <React.Fragment key={mediaType}>
                      <tr>
                        <td
                          colSpan={15}
                          className="bg-muted/30 px-3 py-1.5 text-left text-xs font-semibold"
                        >
                          {MEDIA_TYPE_LABELS[mediaType] ?? mediaType} — {entries.length} rows
                        </td>
                      </tr>
                      {entries.map(({ row, index: rowIndex }, rowInGroup) => {
                        const isFirst = rowInGroup === 0
                        const rowspan = entries.length
                        return (
                          <tr key={row.lineItemId}>
                            {isFirst ? (
                              <td
                                rowSpan={rowspan}
                                className="align-top border-b border-border/30 px-2 py-1 text-[10px] text-muted-foreground"
                                title={MEDIA_TYPE_LABELS[row.media_type] ?? row.media_type}
                              >
                                {MEDIA_TYPE_LABELS[row.media_type] ?? row.media_type}
                              </td>
                            ) : null}
                            <td
                              className="max-w-[90px] truncate border-b border-border/30 px-2 py-1 text-[11px]"
                              title={row.publisher}
                            >
                              {row.publisher}
                            </td>
                            <td
                              className="max-w-[110px] truncate border-b border-border/30 px-2 py-1 text-[11px]"
                              title={row.lineItemLabel}
                            >
                              {row.lineItemLabel}
                            </td>
                            <td
                              className="truncate border-b border-border/30 px-2 py-1 text-[11px]"
                              title={row.buyType}
                            >
                              {row.buyType}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right">
                              {audFmt.format(row.spend)}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right">
                              {numAuFmt.format(row.deliverables)}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right">
                              <input
                                type="text"
                                className={inputClass}
                                key={`ctr-${row.lineItemId}-${row.ctr}`}
                                defaultValue={formatPercentForInput(row.ctr)}
                                onBlur={(e) => {
                                  const parsed = parsePercentHeuristic(e.target.value)
                                  if (parsed !== null && parsed < 0) {
                                    setFieldErrors((prev) => ({
                                      ...prev,
                                      [rowIndex]: {
                                        ...prev[rowIndex],
                                        ctr: "Targets cannot be negative.",
                                      },
                                    }))
                                    return
                                  }
                                  setFieldErrors((prev) => {
                                    const next = { ...prev }
                                    if (next[rowIndex]) {
                                      const rowErr = { ...next[rowIndex] }
                                      delete rowErr.ctr
                                      if (Object.keys(rowErr).length === 0) {
                                        delete next[rowIndex]
                                      } else {
                                        next[rowIndex] = rowErr
                                      }
                                    }
                                    return next
                                  })
                                  handleFieldChange(rowIndex, "ctr", parsed)
                                }}
                              />
                              {fieldErrors[rowIndex]?.ctr && (
                                <div className="text-xs text-destructive mt-1">
                                  {fieldErrors[rowIndex].ctr}
                                </div>
                              )}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right">
                              <input
                                type="text"
                                className={inputClass}
                                key={`vtr-${row.lineItemId}-${row.vtr}`}
                                defaultValue={formatPercentForInput(row.vtr)}
                                onBlur={(e) => {
                                  const parsed = parsePercentHeuristic(e.target.value)
                                  if (parsed !== null && parsed < 0) {
                                    setFieldErrors((prev) => ({
                                      ...prev,
                                      [rowIndex]: {
                                        ...prev[rowIndex],
                                        vtr: "Targets cannot be negative.",
                                      },
                                    }))
                                    return
                                  }
                                  setFieldErrors((prev) => {
                                    const next = { ...prev }
                                    if (next[rowIndex]) {
                                      const rowErr = { ...next[rowIndex] }
                                      delete rowErr.vtr
                                      if (Object.keys(rowErr).length === 0) {
                                        delete next[rowIndex]
                                      } else {
                                        next[rowIndex] = rowErr
                                      }
                                    }
                                    return next
                                  })
                                  handleFieldChange(rowIndex, "vtr", parsed)
                                }}
                              />
                              {fieldErrors[rowIndex]?.vtr && (
                                <div className="text-xs text-destructive mt-1">
                                  {fieldErrors[rowIndex].vtr}
                                </div>
                              )}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right">
                              <input
                                type="text"
                                className={inputClass}
                                key={`cpv-${row.lineItemId}-${row.cpv ?? "null"}`}
                                defaultValue={row.cpv === null ? "" : row.cpv.toFixed(2)}
                                onBlur={(e) => {
                                  const cleaned = e.target.value.replace(/[^0-9.-]/g, "").trim()
                                  const val = cleaned === "" ? null : parseFloat(cleaned)
                                  const parsed = val !== null && Number.isFinite(val) ? val : null
                                  if (parsed !== null && parsed < 0) {
                                    setFieldErrors((prev) => ({
                                      ...prev,
                                      [rowIndex]: {
                                        ...prev[rowIndex],
                                        cpv: "Targets cannot be negative.",
                                      },
                                    }))
                                    return
                                  }
                                  setFieldErrors((prev) => {
                                    const next = { ...prev }
                                    if (next[rowIndex]) {
                                      const rowErr = { ...next[rowIndex] }
                                      delete rowErr.cpv
                                      if (Object.keys(rowErr).length === 0) {
                                        delete next[rowIndex]
                                      } else {
                                        next[rowIndex] = rowErr
                                      }
                                    }
                                    return next
                                  })
                                  handleFieldChange(rowIndex, "cpv", parsed)
                                }}
                              />
                              {fieldErrors[rowIndex]?.cpv && (
                                <div className="text-xs text-destructive mt-1">
                                  {fieldErrors[rowIndex].cpv}
                                </div>
                              )}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right">
                              <input
                                type="text"
                                className={inputClass}
                                key={`conv-${row.lineItemId}-${row.conversion_rate}`}
                                defaultValue={formatPercentForInput(row.conversion_rate)}
                                onBlur={(e) => {
                                  const parsed = parsePercentHeuristic(e.target.value)
                                  if (parsed !== null && parsed < 0) {
                                    setFieldErrors((prev) => ({
                                      ...prev,
                                      [rowIndex]: {
                                        ...prev[rowIndex],
                                        conversion_rate: "Targets cannot be negative.",
                                      },
                                    }))
                                    return
                                  }
                                  setFieldErrors((prev) => {
                                    const next = { ...prev }
                                    if (next[rowIndex]) {
                                      const rowErr = { ...next[rowIndex] }
                                      delete rowErr.conversion_rate
                                      if (Object.keys(rowErr).length === 0) {
                                        delete next[rowIndex]
                                      } else {
                                        next[rowIndex] = rowErr
                                      }
                                    }
                                    return next
                                  })
                                  handleFieldChange(rowIndex, "conversion_rate", parsed)
                                }}
                              />
                              {fieldErrors[rowIndex]?.conversion_rate && (
                                <div className="text-xs text-destructive mt-1">
                                  {fieldErrors[rowIndex].conversion_rate}
                                </div>
                              )}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right">
                              <input
                                type="text"
                                className={inputClass}
                                key={`freq-${row.lineItemId}-${row.frequency ?? "null"}`}
                                defaultValue={row.frequency === null ? "" : row.frequency.toFixed(1)}
                                onBlur={(e) => {
                                  const cleaned = e.target.value.replace(/[^0-9.-]/g, "").trim()
                                  const val = cleaned === "" ? null : parseFloat(cleaned)
                                  const parsed = val !== null && Number.isFinite(val) ? val : null
                                  if (parsed !== null && parsed < 0) {
                                    setFieldErrors((prev) => ({
                                      ...prev,
                                      [rowIndex]: {
                                        ...prev[rowIndex],
                                        frequency: "Targets cannot be negative.",
                                      },
                                    }))
                                    return
                                  }
                                  setFieldErrors((prev) => {
                                    const next = { ...prev }
                                    if (next[rowIndex]) {
                                      const rowErr = { ...next[rowIndex] }
                                      delete rowErr.frequency
                                      if (Object.keys(rowErr).length === 0) {
                                        delete next[rowIndex]
                                      } else {
                                        next[rowIndex] = rowErr
                                      }
                                    }
                                    return next
                                  })
                                  handleFieldChange(rowIndex, "frequency", parsed)
                                }}
                              />
                              {fieldErrors[rowIndex]?.frequency && (
                                <div className="text-xs text-destructive mt-1">
                                  {fieldErrors[rowIndex].frequency}
                                </div>
                              )}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right text-muted-foreground">
                              {row.calculatedClicks != null
                                ? numAuFmt.format(row.calculatedClicks)
                                : ""}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right text-muted-foreground">
                              {row.calculatedViews != null
                                ? numAuFmt.format(row.calculatedViews)
                                : ""}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right text-muted-foreground">
                              {row.calculatedReach != null
                                ? numAuFmt.format(row.calculatedReach)
                                : ""}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1">
                              <div className="flex flex-wrap items-center gap-1">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "px-1.5 py-0 text-[10px] font-medium",
                                    sourceBadgeClass(row.source),
                                  )}
                                >
                                  {row.source}
                                </Badge>
                                {row.hasPublisherKpi === false ? (
                                  <span
                                    className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700"
                                    title="This line item has no publisher KPI row."
                                  >
                                    no pub KPI
                                  </span>
                                ) : null}
                                {row.hasPublisherKpi === false && onPublisherKpiAdded ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-1.5 text-[10px]"
                                    disabled={publisherKpiSavingRowId !== null}
                                    onClick={() => openPublisherKpiDraft(row)}
                                  >
                                    Add publisher KPI
                                  </Button>
                                ) : null}
                              </div>
                              {publisherKpiDraftRowId === row.lineItemId ? (
                                <div className="mt-2 w-[360px] max-w-[75vw] rounded-lg border border-amber-200 bg-amber-50/50 p-2 text-left shadow-sm">
                                  <div className="mb-2 flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-[11px] font-semibold text-foreground">
                                        Add publisher KPI
                                      </p>
                                      <p className="truncate text-[10px] text-muted-foreground">
                                        {MEDIA_TYPE_LABELS[row.media_type] ?? row.media_type} ·{" "}
                                        {row.bid_strategy || "No bid strategy"}
                                      </p>
                                      {!resolvePublisherForPublisherKpi(row, publishers).resolvedByPublisherId ? (
                                        <p className="mt-1 text-[10px] text-amber-700">
                                          Publisher ID not found; this will be saved by name.
                                        </p>
                                      ) : null}
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-1.5 text-[10px]"
                                      disabled={publisherKpiSavingRowId === row.lineItemId}
                                      onClick={() => setPublisherKpiDraftRowId(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-medium text-muted-foreground">
                                        Media type
                                      </label>
                                      <input
                                        type="text"
                                        value={row.media_type}
                                        readOnly
                                        className="h-7 w-full rounded border border-border/40 bg-muted/40 px-2 text-[11px]"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-medium text-muted-foreground">
                                        Bid strategy
                                      </label>
                                      <input
                                        type="text"
                                        value={row.bid_strategy}
                                        readOnly
                                        className="h-7 w-full rounded border border-border/40 bg-muted/40 px-2 text-[11px]"
                                      />
                                    </div>
                                    {CLIENT_KPI_METRIC_FIELDS.map((field) => (
                                      <div key={field} className="space-y-1">
                                        <label className="text-[10px] font-medium text-muted-foreground">
                                          {CLIENT_KPI_METRIC_LABELS[field] ?? field}
                                        </label>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={publisherKpiMetrics[field]}
                                          disabled={publisherKpiSavingRowId === row.lineItemId}
                                          onChange={(e) =>
                                            updatePublisherKpiMetric(field, e.target.value)
                                          }
                                          className="h-7 w-full rounded border border-input bg-background px-2 text-right text-[11px] tabular-nums"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-2 flex justify-end">
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-7 text-[11px]"
                                      disabled={publisherKpiSavingRowId === row.lineItemId}
                                      onClick={() => void savePublisherKpi(row)}
                                    >
                                      {publisherKpiSavingRowId === row.lineItemId ? (
                                        <>
                                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                          Saving
                                        </>
                                      ) : (
                                        "Save publisher KPI"
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="flex shrink-0 flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span>
                <span className="text-green-600">●</span> Saved
              </span>
              <span>
                <span className="text-blue-600">●</span> Client
              </span>
              <span>
                <span className="text-slate-500">●</span> Publisher
              </span>
              <span>
                <span className="text-amber-600">●</span> Manual
              </span>
              <span>
                <span className="text-red-400">●</span> Default
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving}
                onClick={() => {
                  onReset()
                  onClose()
                }}
              >
                Reset to Auto
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSaving}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={isSaving || Object.keys(fieldErrors).length > 0}
                title={
                  Object.keys(fieldErrors).length > 0
                    ? "Fix validation errors before saving."
                    : "KPIs will be saved to Xano when you save the campaign"
                }
                onClick={() => {
                  onSave(editedRows)
                  onClose()
                }}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save KPIs"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default KPIEditModal
