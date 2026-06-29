"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { saveAs } from "file-saver"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import { ChevronDown, ChevronRight, Download, Loader2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { useToast } from "@/components/ui/use-toast"
import { formatMoney } from "@/lib/format/money"
import { buildReportRows } from "@/lib/finance/report/buildReportRows"
import { exportReportExcel } from "@/lib/finance/report/exportReportExcel"
import { groupAndSubtotal, type SubtotalNode } from "@/lib/finance/report/groupAndSubtotal"
import type { ReportDimension, ReportRow } from "@/lib/finance/report/types"
import { useFinanceStore } from "@/lib/finance/useFinanceStore"
import type { FinanceFilters } from "@/lib/types/financeBilling"
import { cn } from "@/lib/utils"

const GROUP_BY_STORAGE_KEY = "financeReport:groupBy"
const EXPANDED_STORAGE_KEY = "financeReport:expanded"
const SHOW_DETAIL_ROWS_STORAGE_KEY = "financeReport:showDetailRows"
const DEFAULT_GROUP_BY: ReportDimension[] = ["mediaType", "publisher", "buyType"]
const moneyOptions = { locale: "en-AU", currency: "AUD" } as const

const dimensions: Array<{ key: ReportDimension; label: string }> = [
  { key: "mediaType", label: "Media type" },
  { key: "publisher", label: "Publisher" },
  { key: "buyType", label: "Buy type" },
  { key: "format", label: "Format" },
  { key: "station", label: "Station" },
  { key: "client", label: "Client" },
  { key: "billingMonth", label: "Billing month" },
]

type ReportTableRow = {
  id: string
  kind: "subtotal" | "detail"
  label: string
  dimension: string
  depth: number
  rowCount: number | null
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
      rowCount: child.rowCount,
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
          rowCount: null,
          measures: {
            totalBillable: detail.totalBillable,
            mediaSpend: detail.mediaSpend,
            agencyFee: detail.agencyFee,
          },
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => readExpanded())
  const [showDetailRows, setShowDetailRows] = useState(() => readShowDetailRows())
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    localStorage.setItem(GROUP_BY_STORAGE_KEY, JSON.stringify(groupBy))
  }, [groupBy])

  useEffect(() => {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(expanded))
  }, [expanded])

  useEffect(() => {
    localStorage.setItem(SHOW_DETAIL_ROWS_STORAGE_KEY, showDetailRows ? "1" : "0")
  }, [showDetailRows])

  const reportRows = useMemo(() => buildReportRows(billingRecords), [billingRecords])
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

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((current) => ({ ...current, [id]: current[id] === false }))
  }, [])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const blob = await exportReportExcel(subtotalRoot, groupBy, { filterLabel: activeFilterLabel })
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
  }, [activeFilterLabel, groupBy, subtotalRoot, toast])

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
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
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
      {
        id: "rowCount",
        header: "Rows",
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{row.original.rowCount ?? ""}</span>
        ),
      },
      {
        id: "totalBillable",
        header: "Total billable",
        cell: ({ row }) => (
          <span className="tabular-nums">{formatMoney(row.original.measures.totalBillable, moneyOptions)}</span>
        ),
      },
      {
        id: "mediaSpend",
        header: "Media spend",
        cell: ({ row }) => (
          <span className="tabular-nums">{formatMoney(row.original.measures.mediaSpend, moneyOptions)}</span>
        ),
      },
      {
        id: "agencyFee",
        header: "Agency fee",
        cell: ({ row }) => (
          <span className="tabular-nums">{formatMoney(row.original.measures.agencyFee, moneyOptions)}</span>
        ),
      },
    ],
    [expanded, toggleExpanded]
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
                  className="gap-1.5 rounded-md px-2 py-1"
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
                        className="rounded px-1 text-xs hover:bg-background/60 disabled:opacity-40"
                        disabled={activeIndex === 0}
                        onClick={() => setGroupBy((order) => moveDimension(order, dimension.key, -1))}
                        aria-label={`Move ${dimension.label} earlier`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="rounded px-1 text-xs hover:bg-background/60 disabled:opacity-40"
                        disabled={activeIndex === groupBy.length - 1}
                        onClick={() => setGroupBy((order) => moveDimension(order, dimension.key, 1))}
                        aria-label={`Move ${dimension.label} later`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="rounded p-0.5 hover:bg-background/60"
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading billing rows…
        </div>
      ) : null}

      {!billingLoading && reportRows.length === 0 ? (
        <div className="rounded-lg border border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
          No report rows for the current filters.
        </div>
      ) : null}

      {reportRows.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border/80 bg-card/30 shadow-sm">
          <Table className="min-w-[760px]">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "h-10 bg-muted/40 text-xs uppercase tracking-wide",
                        ["totalBillable", "mediaSpend", "agencyFee", "rowCount"].includes(header.column.id) &&
                          "text-right"
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
                    row.original.kind === "subtotal" && row.original.depth === 0 && "bg-muted/15",
                    row.original.kind === "detail" && "text-muted-foreground"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "px-3 py-2 text-sm",
                        ["totalBillable", "mediaSpend", "agencyFee", "rowCount"].includes(cell.column.id) &&
                          "text-right"
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-muted/50">
                <TableCell className="px-3 py-3 font-semibold">Grand total</TableCell>
                <TableCell />
                <TableCell className="px-3 py-3 text-right tabular-nums">{subtotalRoot.rowCount}</TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums font-semibold">
                  {formatMoney(subtotalRoot.measures.totalBillable, moneyOptions)}
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums font-semibold">
                  {formatMoney(subtotalRoot.measures.mediaSpend, moneyOptions)}
                </TableCell>
                <TableCell className="px-3 py-3 text-right tabular-nums font-semibold">
                  {formatMoney(subtotalRoot.measures.agencyFee, moneyOptions)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      ) : null}
    </div>
  )
}
