"use client"

import * as React from "react"
import type { ResolvedKPIRow } from "@/types/kpi"
import { MEDIA_TYPE_LABELS } from "@/components/kpis/KPISection"
import { recalcRow } from "@/lib/kpi/recalcRow"
import { formatPercentForInput, parsePercentHeuristic } from "@/lib/kpi/percentMetrics"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

export interface KPIEditModalProps {
  open: boolean
  onClose: () => void
  kpiRows: ResolvedKPIRow[]
  onSave: (rows: ResolvedKPIRow[]) => void
  onReset: () => void
  isSaving?: boolean
}

const audFmt = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })
const numAuFmt = new Intl.NumberFormat("en-AU")

const headerCell =
  "sticky top-0 z-10 bg-background text-[10px] font-semibold uppercase tracking-wider text-muted-foreground h-8 px-2 border-b border-border/40 shadow-[0_1px_0_0_hsl(var(--border))]"

const inputClass =
  "w-full text-right bg-transparent border border-border/30 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary text-[11px]"

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
  kpiRows,
  onSave,
  onReset,
  isSaving,
}: KPIEditModalProps) {
  const [editedRows, setEditedRows] = React.useState<ResolvedKPIRow[]>([])
  const [filterMediaType, setFilterMediaType] = React.useState("all")
  const [showSourceFilter, setShowSourceFilter] = React.useState("all")

  React.useEffect(() => {
    if (!open) return
    setEditedRows([...kpiRows])
  }, [open, kpiRows])

  const handleFieldChange = React.useCallback(
    (
      rowIndex: number,
      field: "ctr" | "vtr" | "conversion_rate" | "frequency",
      value: number,
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
                          colSpan={14}
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
                                  handleFieldChange(rowIndex, "ctr", parsed)
                                }}
                              />
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right">
                              <input
                                type="text"
                                className={inputClass}
                                key={`vtr-${row.lineItemId}-${row.vtr}`}
                                defaultValue={formatPercentForInput(row.vtr)}
                                onBlur={(e) => {
                                  const parsed = parsePercentHeuristic(e.target.value)
                                  handleFieldChange(rowIndex, "vtr", parsed)
                                }}
                              />
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right">
                              <input
                                type="text"
                                className={inputClass}
                                key={`conv-${row.lineItemId}-${row.conversion_rate}`}
                                defaultValue={formatPercentForInput(row.conversion_rate)}
                                onBlur={(e) => {
                                  const parsed = parsePercentHeuristic(e.target.value)
                                  handleFieldChange(rowIndex, "conversion_rate", parsed)
                                }}
                              />
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right">
                              <input
                                type="text"
                                className={inputClass}
                                key={`freq-${row.lineItemId}-${row.frequency}`}
                                defaultValue={row.frequency.toFixed(1)}
                                onBlur={(e) => {
                                  const val =
                                    parseFloat(e.target.value.replace(/[^0-9.-]/g, "")) || 0
                                  handleFieldChange(rowIndex, "frequency", val)
                                }}
                              />
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right text-muted-foreground">
                              {numAuFmt.format(row.calculatedClicks)}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right text-muted-foreground">
                              {numAuFmt.format(row.calculatedViews)}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1 text-right text-muted-foreground">
                              {numAuFmt.format(row.calculatedReach)}
                            </td>
                            <td className="border-b border-border/30 px-2 py-1">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "px-1.5 py-0 text-[10px] font-medium",
                                  sourceBadgeClass(row.source),
                                )}
                              >
                                {row.source}
                              </Badge>
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
                size="sm"
                disabled={isSaving}
                title="KPIs will be saved to Xano when you save the campaign"
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
