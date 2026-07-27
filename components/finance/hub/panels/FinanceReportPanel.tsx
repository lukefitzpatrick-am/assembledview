"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { saveAs } from "file-saver"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import { Bookmark, ChevronDown, ChevronRight, Download, Loader2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { EmptyState, LoadingState } from "@/components/ui/states"
import { useToast } from "@/components/ui/use-toast"
import { formatAUD } from "@/lib/format/money"
import { buildReportRows } from "@/lib/finance/report/buildReportRows"
import { exportReportExcel } from "@/lib/finance/report/exportReportExcel"
import { groupAndSubtotal, type SubtotalNode } from "@/lib/finance/report/groupAndSubtotal"
import {
  DEFAULT_REPORT_METRICS,
  REPORT_METRICS,
  isReportMetricKey,
  measuresFromReportRow,
  metricDef,
  type ReportMetricKey,
} from "@/lib/finance/report/metrics"
import type { ReportDimension, ReportRow } from "@/lib/finance/report/types"
import {
  normalizeSavedReportConfig,
  readHubSavedViews,
  subscribeHubSavedViews,
  upsertHubSavedView,
} from "@/lib/finance/hubSavedViews"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"
import type { FinanceFilters } from "@/lib/types/financeBilling"
import { cn } from "@/lib/utils"

const GROUP_BY_STORAGE_KEY = "financeReport:groupBy"
const METRICS_STORAGE_KEY = "financeReport:metrics"
const EXPANDED_STORAGE_KEY = "financeReport:expanded"
const SHOW_DETAIL_ROWS_STORAGE_KEY = "financeReport:showDetailRows"
const DEFAULT_GROUP_BY: ReportDimension[] = ["mediaType", "publisher", "buyType"]

const dimensions: Array<{ key: ReportDimension; label: string }> = [
  { key: "mediaType", label: "Media type" },
  { key: "publisher", label: "Publisher" },
  { key: "buyType", label: "Buy type" },
  { key: "format", label: "Format" },
  { key: "station", label: "Station" },
  { key: "client", label: "Client" },
  { key: "billingMonth", label: "Billing month" },
  { key: "financialYear", label: "Financial year" },
  { key: "mbaNumber", label: "MBA number" },
  { key: "billingType", label: "Billing type" },
  { key: "billingStatus", label: "Billing status" },
  { key: "rowKind", label: "Row kind" },
  { key: "clientPays", label: "Client pays" },
  { key: "billingAgency", label: "AA vs Assembled Media" },
]

type ReportTableRow = {
  id: string
  kind: "subtotal" | "detail"
  label: string
  dimension: string
  depth: number
  measures: SubtotalNode["measures"]
  hasChildren: boolean
}

function readGroupBy(): ReportDimension[] {
  if (typeof window === "undefined") return DEFAULT_GROUP_BY
  try {
    const raw = localStorage.getItem(GROUP_BY_STORAGE_KEY)
    if (!raw) return DEFAULT_GROUP_BY
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return DEFAULT_GROUP_BY
    const allowed = new Set(dimensions.map((d) => d.key))
    return parsed.filter((value): value is ReportDimension => allowed.has(value as ReportDimension))
  } catch {
    return DEFAULT_GROUP_BY
  }
}

function readMetrics(): ReportMetricKey[] {
  if (typeof window === "undefined") return [...DEFAULT_REPORT_METRICS]
  try {
    const raw = localStorage.getItem(METRICS_STORAGE_KEY)
    if (!raw) return [...DEFAULT_REPORT_METRICS]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_REPORT_METRICS]
    const selected = parsed.filter(isReportMetricKey)
    return selected.length > 0 ? selected : [...DEFAULT_REPORT_METRICS]
  } catch {
    return [...DEFAULT_REPORT_METRICS]
  }
}

function readExpanded(): Record<string, boolean> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function readShowDetailRows(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(SHOW_DETAIL_ROWS_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function dimensionLabel(dimension: ReportDimension | null): string {
  if (!dimension) return ""
  return dimensions.find((d) => d.key === dimension)?.label ?? dimension
}

function nodeId(node: SubtotalNode, depth: number, parentId: string): string {
  return `${parentId}/${depth}:${node.dimension ?? "root"}:${node.key}`
}

function serviceDetailLabel(row: ReportRow): string {
  if (row.serviceType === "adServing") return "Ad Serving"
  if (row.serviceType === "production") return "Production"
  if (row.serviceType === "agencyFee") return "Agency Fee"
  return row.mediaType
}

function mediaDetailLabel(row: ReportRow): string {
  const parts = [row.publisher, row.buyType, row.format, row.station].filter(
    (value) => value && value !== "Unspecified"
  )
  const label = parts.length > 0 ? parts.join(" · ") : row.mediaType
  return row.clientPays ? `${label} (client pays)` : label
}

function detailLabel(row: ReportRow): string {
  return row.rowKind === "service" ? serviceDetailLabel(row) : mediaDetailLabel(row)
}

function flattenNodes(
  node: SubtotalNode,
  expanded: Record<string, boolean>,
  showDetailRows: boolean,
  depth = 0,
  parentId = "root"
): ReportTableRow[] {
  const rows: ReportTableRow[] = []
  for (const child of node.children) {
    const id = nodeId(child, depth, parentId)
    const hasChildren = child.children.length > 0
    rows.push({
      id,
      kind: "subtotal",
      label: child.key,
      dimension: dimensionLabel(child.dimension),
      depth,
      measures: child.measures,
      hasChildren,
    })
    if (hasChildren && expanded[id] !== false) {
      rows.push(...flattenNodes(child, expanded, showDetailRows, depth + 1, id))
    } else if (!hasChildren && showDetailRows) {
      rows.push(
        ...child.leafRows.map((detail, index) => ({
          id: `${id}/detail:${index}`,
          kind: "detail" as const,
          label: detailLabel(detail),
          dimension: "Detail",
          depth: depth + 1,
          measures: measuresFromReportRow(detail),
          hasChildren: false,
        }))
      )
    }
  }
  return rows
}

function moveDimension(order: ReportDimension[], dimension: ReportDimension, direction: -1 | 1) {
  const index = order.indexOf(dimension)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return order
  const next = [...order]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item!)
  return next
}

function moveMetric(order: ReportMetricKey[], metric: ReportMetricKey, direction: -1 | 1) {
  const index = order.indexOf(metric)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return order
  const next = [...order]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item!)
  return next
}

function formatMetricValue(key: ReportMetricKey, value: number): string {
  const def = metricDef(key)
  if (def.kind === "count") return String(Math.round(value))
  return formatAUD(value)
}

function filterLabel(filters: FinanceFilters): string {
  const month =
    filters.monthRange.from === filters.monthRange.to
      ? filters.monthRange.from
      : `${filters.monthRange.from} to ${filters.monthRange.to}`
  const clients =
    filters.selectedClients.length > 0 ? `${filters.selectedClients.length} client(s)` : "all clients"
  const types = filters.billingTypes.length > 0 ? filters.billingTypes.join(", ") : "all types"
  const statuses = filters.statuses.length > 0 ? filters.statuses.join(", ") : "all statuses"
  const drafts = filters.includeDrafts ? "including drafts" : "excluding drafts"
  return `${month} · ${clients} · ${types} · ${statuses} · ${drafts}`
}

function filenameToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function FinanceReportPanel() {
  const billingRecords = useFinanceStore((s) => s.billingRecords)
  const billingLoading = useFinanceStore((s) => s.billingLoading)
  const filters = useFinanceStore((s) => s.filters)
  const { toast } = useToast()

  const [groupBy, setGroupBy] = useState<ReportDimension[]>(() => readGroupBy())
  const [metrics, setMetrics] = useState<ReportMetricKey[]>(() => readMetrics())
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => readExpanded())
  const [showDetailRows, setShowDetailRows] = useState(() => readShowDetailRows())
  const [exporting, setExporting] = useState(false)
  const [savedReportNames, setSavedReportNames] = useState<string[]>(() =>
    readHubSavedViews()
      .filter((view) => view.report)
      .map((view) => view.name)
  )
  const [publisherBillingAgencyByName, setPublisherBillingAgencyByName] = useState<
    Map<string, string>
  >(() => new Map())

  useEffect(() => {
    localStorage.setItem(GROUP_BY_STORAGE_KEY, JSON.stringify(groupBy))
  }, [groupBy])

  useEffect(() => {
    localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(metrics))
  }, [metrics])

  useEffect(() => {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(expanded))
  }, [expanded])

  useEffect(() => {
    localStorage.setItem(SHOW_DETAIL_ROWS_STORAGE_KEY, showDetailRows ? "1" : "0")
  }, [showDetailRows])

  useEffect(() => {
    const refreshSavedReports = () => {
      setSavedReportNames(
        readHubSavedViews()
          .filter((view) => view.report)
          .map((view) => view.name)
      )
    }
    return subscribeHubSavedViews(refreshSavedReports)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // Same source as FinanceFilterToolbar / payables: `/api/publishers` → publishersCache (includes billingagency).
        const res = await fetch("/api/publishers")
        if (!res.ok) return
        const data = (await res.json()) as unknown
        if (cancelled || !Array.isArray(data)) return
        const next = new Map<string, string>()
        for (const row of data) {
          if (!row || typeof row !== "object") continue
          const record = row as Record<string, unknown>
          const name = String(record.publisher_name ?? "").trim()
          if (!name || next.has(name)) continue
          const agency = record.billingagency ?? record.billing_agency ?? record.billingAgency
          if (agency == null) continue
          next.set(name, String(agency))
        }
        setPublisherBillingAgencyByName(next)
      } catch {
        if (!cancelled) setPublisherBillingAgencyByName(new Map())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const reportRows = useMemo(
    () => buildReportRows(billingRecords, { publisherBillingAgencyByName }),
    [billingRecords, publisherBillingAgencyByName]
  )
  const subtotalRoot = useMemo(() => groupAndSubtotal(reportRows, groupBy), [groupBy, reportRows])
  const tableRows = useMemo(
    () => flattenNodes(subtotalRoot, expanded, showDetailRows),
    [expanded, showDetailRows, subtotalRoot]
  )
  const activeFilterLabel = useMemo(() => filterLabel(filters), [filters])

  const toggleDimension = useCallback((dimension: ReportDimension) => {
    setGroupBy((current) =>
      current.includes(dimension)
        ? current.filter((candidate) => candidate !== dimension)
        : [...current, dimension]
    )
  }, [])

  const toggleMetric = useCallback((metric: ReportMetricKey) => {
    setMetrics((current) => {
      if (current.includes(metric)) {
        if (current.length <= 1) return current
        return current.filter((candidate) => candidate !== metric)
      }
      return [...current, metric]
    })
  }, [])

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((current) => ({ ...current, [id]: current[id] === false }))
  }, [])

  const savedReportsList = useMemo(
    () => readHubSavedViews().filter((view) => view.report),
    [savedReportNames]
  )

  const saveCurrentReport = useCallback(() => {
    const name = window.prompt("Name this saved report")
    if (!name || !name.trim()) return
    const snap = useFinanceStore.getState().filters
    const next = upsertHubSavedView({
      name: name.trim(),
      filters: { ...snap },
      report: {
        groupBy,
        metrics,
        showDetailRows,
      },
    })
    setSavedReportNames(
      readHubSavedViews()
        .filter((view) => view.report)
        .map((view) => view.name)
    )
    toast({
      title: "Report saved",
      description: `“${next.name}” stored in this browser (report layout only on load).`,
    })
  }, [groupBy, metrics, showDetailRows, toast])

  const loadSavedReport = useCallback(
    (name: string) => {
      const view = readHubSavedViews().find((candidate) => candidate.name === name)
      const report = normalizeSavedReportConfig(view?.report)
      if (!report) {
        toast({
          variant: "destructive",
          title: "Report not found",
          description: "That saved entry has no report configuration.",
        })
        return
      }
      // Report-only restore — hub filter bar is intentionally left unchanged.
      const allowedDims = new Set(dimensions.map((d) => d.key))
      setGroupBy(report.groupBy.filter((dim) => allowedDims.has(dim)))
      setMetrics(report.metrics.length > 0 ? report.metrics : [...DEFAULT_REPORT_METRICS])
      setShowDetailRows(report.showDetailRows)
      toast({ title: "Report loaded", description: `Applied “${name}”.` })
    },
    [toast]
  )

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const blob = await exportReportExcel(subtotalRoot, groupBy, metrics, {
        filterLabel: activeFilterLabel,
      })
      saveAs(blob, `assembled-report_${filenameToday()}.xlsx`)
      toast({ title: "Export ready", description: "Download should start shortly." })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setExporting(false)
    }
  }, [activeFilterLabel, groupBy, metrics, subtotalRoot, toast])

  const columns = useMemo<ColumnDef<ReportTableRow>[]>(
    () => [
      {
        id: "group",
        header: "Group",
        cell: ({ row }) => {
          const original = row.original
          const collapsed = expanded[original.id] === false
          return (
            <div className="flex items-center gap-2" style={{ paddingLeft: original.depth * 18 }}>
              {original.hasChildren ? (
                <button
                  type="button"
                  className="rounded-input p-0.5 text-muted-foreground hover:bg-table-row-hover hover:text-foreground"
                  onClick={() => toggleExpanded(original.id)}
                  aria-label={collapsed ? `Expand ${original.label}` : `Collapse ${original.label}`}
                >
                  {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              ) : (
                <span className="h-5 w-5" aria-hidden />
              )}
              <span className={cn(original.kind === "subtotal" && "font-medium")}>{original.label}</span>
            </div>
          )
        },
      },
      {
        accessorKey: "dimension",
        header: "Dimension",
        cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue() ?? "")}</span>,
      },
      ...metrics.map((metricKey) => ({
        id: metricKey,
        header: metricDef(metricKey).label,
        cell: ({ row }: { row: { original: ReportTableRow } }) => (
          <span className="num">{formatMetricValue(metricKey, row.original.measures[metricKey] ?? 0)}</span>
        ),
      })),
    ],
    [expanded, metrics, toggleExpanded]
  )

  const table = useReactTable({
    data: tableRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div>
            <h2 className="text-lg font-semibold">Report</h2>
            <p className="text-sm text-muted-foreground">
              Grouped subtotals from the current finance hub billing filter scope.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {dimensions.map((dimension) => {
              const activeIndex = groupBy.indexOf(dimension.key)
              const active = activeIndex >= 0
              return (
                <Badge
                  key={dimension.key}
                  variant={active ? "info" : "outline"}
                  className="gap-1.5 rounded-input px-2 py-1"
                >
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => toggleDimension(dimension.key)}
                  >
                    {active ? `${activeIndex + 1}. ` : ""}
                    {dimension.label}
                  </button>
                  {active ? (
                    <>
                      <button
                        type="button"
                        className="rounded-input px-1 text-xs hover:bg-table-row-hover disabled:opacity-40"
                        disabled={activeIndex === 0}
                        onClick={() => setGroupBy((order) => moveDimension(order, dimension.key, -1))}
                        aria-label={`Move ${dimension.label} earlier`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="rounded-input px-1 text-xs hover:bg-table-row-hover disabled:opacity-40"
                        disabled={activeIndex === groupBy.length - 1}
                        onClick={() => setGroupBy((order) => moveDimension(order, dimension.key, 1))}
                        aria-label={`Move ${dimension.label} later`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="rounded-input p-0.5 hover:bg-table-row-hover"
                        onClick={() => toggleDimension(dimension.key)}
                        aria-label={`Remove ${dimension.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : null}
                </Badge>
              )
            })}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Metrics</p>
            <div className="flex flex-wrap gap-2">
              {REPORT_METRICS.map((metric) => {
                const activeIndex = metrics.indexOf(metric.key)
                const active = activeIndex >= 0
                return (
                  <Badge
                    key={metric.key}
                    variant={active ? "info" : "outline"}
                    className="gap-1.5 rounded-input px-2 py-1"
                  >
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => toggleMetric(metric.key)}
                    >
                      {active ? `${activeIndex + 1}. ` : ""}
                      {metric.label}
                    </button>
                    {active ? (
                      <>
                        <button
                          type="button"
                          className="rounded-input px-1 text-xs hover:bg-table-row-hover disabled:opacity-40"
                          disabled={activeIndex === 0}
                          onClick={() => setMetrics((order) => moveMetric(order, metric.key, -1))}
                          aria-label={`Move ${metric.label} earlier`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="rounded-input px-1 text-xs hover:bg-table-row-hover disabled:opacity-40"
                          disabled={activeIndex === metrics.length - 1}
                          onClick={() => setMetrics((order) => moveMetric(order, metric.key, 1))}
                          aria-label={`Move ${metric.label} later`}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="rounded-input p-0.5 hover:bg-table-row-hover disabled:opacity-40"
                          disabled={metrics.length <= 1}
                          onClick={() => toggleMetric(metric.key)}
                          aria-label={`Remove ${metric.label}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : null}
                  </Badge>
                )
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="finance-report-detail-rows"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Switch
              id="finance-report-detail-rows"
              checked={showDetailRows}
              onCheckedChange={setShowDetailRows}
            />
            Show detail rows
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Bookmark className="mr-2 h-4 w-4" />
                Saved reports
                <ChevronDown className="ml-1 h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={saveCurrentReport}>Save report…</DropdownMenuItem>
              {savedReportsList.length === 0 ? (
                <DropdownMenuItem disabled>No saved reports yet</DropdownMenuItem>
              ) : (
                savedReportsList.map((view) => (
                  <DropdownMenuItem key={view.name} onClick={() => loadSavedReport(view.name)}>
                    {view.name}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExport()}
            disabled={reportRows.length === 0 || exporting}
          >
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export
          </Button>
        </div>
      </div>

      {billingLoading ? (
        <LoadingState rows={4} />
      ) : null}

      {!billingLoading && reportRows.length === 0 ? (
        <EmptyState title="No report rows" message="No report rows for the current filters." />
      ) : null}

      {reportRows.length > 0 ? (
        <div className="overflow-hidden rounded-card border border-border bg-card shadow-e1">
          <Table className="min-w-[760px]">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "h-10 bg-surface-panel text-[11px] font-bold uppercase tracking-wide",
                        metrics.includes(header.column.id as ReportMetricKey) && "text-right"
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.original.id}
                  className={cn(
                    row.original.kind === "subtotal" && row.original.depth === 0 && "bg-surface-panel",
                    row.original.kind === "detail" && "text-muted-foreground"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "px-3 py-2 text-sm",
                        metrics.includes(cell.column.id as ReportMetricKey) && "text-right"
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-table-row-hover">
                <TableCell className="px-3 py-3 font-semibold">Grand total</TableCell>
                <TableCell />
                {metrics.map((metricKey) => (
                  <TableCell
                    key={metricKey}
                    className="num px-3 py-3 text-right font-semibold"
                  >
                    {formatMetricValue(metricKey, subtotalRoot.measures[metricKey] ?? 0)}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      ) : null}
    </div>
  )
}
