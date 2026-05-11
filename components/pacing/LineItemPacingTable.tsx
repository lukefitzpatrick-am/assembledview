"use client"

import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getGroupedRowModel,
  useReactTable,
  type ExpandedState,
  type GroupingState,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronRight } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { formatPacingAud, formatPacingPct1 } from "@/components/pacing/formatters"
import { VarianceRibbon } from "@/components/dashboard/delivery/shared/VarianceRibbon"
import { StatusPill } from "@/components/dashboard/delivery/shared/StatusPill"
import { computeLineItemPacingDerived } from "@/components/pacing/pacingMetrics"
import { pacingStatusForStatusPill } from "@/components/pacing/pacingStatusForStatusPill"
import { PacingSparkline } from "@/components/pacing/PacingSparkline"
import { usePacingOverviewData } from "@/components/pacing/PacingOverviewDataContext"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"
import type { LineItemPacingRow } from "@/lib/xano/pacing-types"

type PacingEnrichedRow = LineItemPacingRow & { clientLabel: string }

const GROUP_H = 40
const DATA_H = 52
const columnHelper = createColumnHelper<PacingEnrichedRow>()

/** Grid tracks: client, line item, media, budget, spend, expected, variance, pace, req, projected, status, spark */
const COL_GRID =
  "minmax(140px,1fr) minmax(160px,1.4fr) 72px 84px 108px 84px 144px 88px 88px 96px 120px 128px"

export function LineItemPacingTable() {
  const { lineItems, historyById, clientNameById, loading, openDrawer } = usePacingOverviewData()
  const filterDateTo = usePacingFilterStore((s) => s.filters.date_to)

  const [groupByClient, setGroupByClient] = useState(true)
  const grouping = useMemo<GroupingState>(() => (groupByClient ? ["clientLabel"] : []), [groupByClient])
  const [expanded, setExpanded] = useState<ExpandedState>(true)

  const data = useMemo<PacingEnrichedRow[]>(() => {
    return lineItems.map((r) => ({
      ...r,
      clientLabel: clientNameById.get(r.clients_id) ?? `Client ${r.clients_id}`,
    }))
  }, [lineItems, clientNameById])

  const columns = useMemo(() => {
    return [
      columnHelper.accessor("clientLabel", {
        header: "Client",
        cell: ({ row, getValue }) => {
          if (row.getIsGrouped()) {
            return (
              <button
                type="button"
                className="flex w-full max-w-[240px] items-center gap-1 text-left font-medium text-foreground hover:underline"
                onClick={(e) => {
                  e.stopPropagation()
                  row.getToggleExpandedHandler()()
                }}
              >
                <ChevronRight
                  className={cn("h-4 w-4 shrink-0 transition-transform", row.getIsExpanded() && "rotate-90")}
                />
                <span className="truncate">{String(row.groupingValue ?? getValue())}</span>
                <span className="shrink-0 text-muted-foreground">({row.subRows.length})</span>
              </button>
            )
          }
          return <span className="text-muted-foreground">—</span>
        },
      }),
      columnHelper.accessor("av_line_item_label", {
        header: "Line item",
        cell: ({ row, getValue }) => {
          if (row.getIsGrouped()) return null
          const id = row.original.av_line_item_id
          const label = getValue() || id
          return (
            <div className="min-w-0">
              <div className="truncate text-sm font-medium" title={String(label)}>
                {String(label)}
              </div>
              <div className="truncate font-mono text-xs text-muted-foreground">{id}</div>
            </div>
          )
        },
      }),
      columnHelper.accessor("media_type", {
        header: "Media",
        cell: ({ row, getValue }) => {
          if (row.getIsGrouped()) return null
          return <span className="capitalize text-muted-foreground">{String(getValue() ?? "—")}</span>
        },
      }),
      columnHelper.display({
        id: "budget",
        header: "Budget",
        cell: ({ row }) => {
          if (row.getIsGrouped()) return null
          return <span className="tabular-nums">{formatPacingAud(row.original.budget_amount)}</span>
        },
      }),
      columnHelper.display({
        id: "spend",
        header: "Spend MTD",
        cell: ({ row }) => {
          if (row.getIsGrouped()) return null
          const d = computeLineItemPacingDerived(row.original, filterDateTo)
          return (
            <div className="space-y-0.5">
              <div className="tabular-nums leading-tight">{formatPacingAud(d.spend)}</div>
              <div className="text-[10px] leading-tight text-muted-foreground">
                {d.pctOfBudget != null ? formatPacingPct1(d.pctOfBudget) : "—"} budget
              </div>
            </div>
          )
        },
      }),
      columnHelper.display({
        id: "expected",
        header: "Expected",
        cell: ({ row }) => {
          if (row.getIsGrouped()) return null
          const d = computeLineItemPacingDerived(row.original, filterDateTo)
          return <span className="tabular-nums text-muted-foreground">{formatPacingAud(d.expected)}</span>
        },
      }),
      columnHelper.display({
        id: "variance",
        header: "Variance",
        cell: ({ row }) => {
          if (row.getIsGrouped()) return null
          const d = computeLineItemPacingDerived(row.original, filterDateTo)
          if (d.variancePct == null || !Number.isFinite(d.variancePct)) {
            return <span className="text-xs text-muted-foreground">—</span>
          }
          return <VarianceRibbon variance={d.variancePct / 100} className="max-w-[140px]" />
        },
      }),
      columnHelper.display({
        id: "pace",
        header: "Daily pace",
        cell: ({ row }) => {
          if (row.getIsGrouped()) return null
          const d = computeLineItemPacingDerived(row.original, filterDateTo)
          return <span className="tabular-nums">{formatPacingAud(d.dailyPace)}</span>
        },
      }),
      columnHelper.display({
        id: "req",
        header: "Req. daily",
        cell: ({ row }) => {
          if (row.getIsGrouped()) return null
          const d = computeLineItemPacingDerived(row.original, filterDateTo)
          const warn = d.requiredDaily > d.dailyPace * 1.5 && d.requiredDaily > 0
          return (
            <span className={cn("tabular-nums", warn && "font-bold text-red-600 dark:text-red-400")}>
              {formatPacingAud(d.requiredDaily)}
            </span>
          )
        },
      }),
      columnHelper.display({
        id: "proj",
        header: "Projected",
        cell: ({ row }) => {
          if (row.getIsGrouped()) return null
          const d = computeLineItemPacingDerived(row.original, filterDateTo)
          return <span className="tabular-nums">{formatPacingAud(d.projectedTotal)}</span>
        },
      }),
      columnHelper.display({
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          if (row.getIsGrouped()) return null
          return <StatusPill {...pacingStatusForStatusPill(row.original.pacing_status)} />
        },
      }),
      columnHelper.display({
        id: "spark",
        header: "14d",
        cell: ({ row }) => {
          if (row.getIsGrouped()) return null
          const pts = historyById.get(row.original.av_line_item_id) ?? []
          const tgt = row.original.expected_spend ?? row.original.budget_amount
          return <PacingSparkline points={pts} expectedTarget={tgt != null ? Number(tgt) : null} />
        },
      }),
    ]
  }, [filterDateTo, historyById])

  const table = useReactTable({
    data,
    columns,
    state: { grouping, expanded },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  })

  const flatRows = table.getRowModel().flatRows
  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (flatRows[i]?.getIsGrouped() ? GROUP_H : DATA_H),
    overscan: 15,
    // Avoid flushSync inside the virtualizer's onChange (see @tanstack/react-virtual); it can
    // trigger "Can't perform a React state update on a component that hasn't mounted yet" during
    // the pacing overview mount/layout when the scroll container attaches and measures.
    useFlushSync: false,
  })

  const gridStyle = useMemo(() => ({ gridTemplateColumns: COL_GRID } as CSSProperties), [])

  const onRowActivate = useCallback(
    (row: (typeof flatRows)[number]) => {
      if (row.getIsGrouped()) return
      openDrawer(row.original)
    },
    [openDrawer]
  )

  if (loading) {
    return (
      <div className="rounded-lg border border-border/60 bg-card p-8 text-sm text-muted-foreground">
        Loading line items…
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-10 text-center text-sm text-muted-foreground">
        No line items match your filters. Try widening the date range or check your mappings.
      </div>
    )
  }

  const headerGroup = table.getHeaderGroups()[0]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
          <Switch checked={groupByClient} onCheckedChange={setGroupByClient} id="pacing-group-client" />
          Group by client
        </Label>
      </div>
      <div
        ref={parentRef}
        className="relative max-h-[min(70vh,840px)] overflow-auto rounded-lg border border-border/60 bg-card"
      >
        <div
          className="sticky top-0 z-20 grid gap-x-1 border-b border-border/60 bg-background px-2 py-2 text-xs font-medium text-muted-foreground shadow-sm"
          style={gridStyle}
        >
          {headerGroup?.headers.map((h) => (
            <div key={h.id} className="flex items-end">
              {flexRender(h.column.columnDef.header, h.getContext())}
            </div>
          ))}
        </div>
        <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((vRow) => {
            const row = flatRows[vRow.index]
            if (!row) return null
            const isGroup = row.getIsGrouped()
            return (
              <div
                key={row.id}
                role="row"
                data-index={vRow.index}
                className={cn(
                  "absolute left-0 right-0 grid gap-x-1 border-b border-border/25 px-2 py-1 text-sm",
                  !isGroup && "cursor-pointer hover:bg-muted/45",
                  isGroup && "bg-muted/20"
                )}
                style={{
                  height: `${vRow.size}px`,
                  transform: `translateY(${vRow.start}px)`,
                  ...gridStyle,
                }}
                onClick={() => onRowActivate(row)}
              >
                {row.getVisibleCells().map((cell) => (
                  <div key={cell.id} className="flex min-w-0 items-center">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
