"use client"

import * as React from "react"
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatDateShort } from "@/lib/format/date"
import { EmptyState } from "@/components/ui/states"
import {
  compareValues,
  SortableTableHeader,
  type SortDirection,
} from "@/components/ui/sortable-table-header"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { downloadCsvRows } from "@/lib/utils/csv-export"

type AccessorValue = string | number | Date | boolean | null | undefined

export interface DataTableColumn<T> {
  id: string
  header: string
  accessor: (row: T) => AccessorValue
  cell?: (row: T) => React.ReactNode
  sortable?: boolean
  align?: "left" | "right" | "center"
  csv?: boolean
  className?: string
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  initialSort?: { id: string; direction: "asc" | "desc" }
  stickyHeader?: boolean
  maxHeight?: string
  csvFilename?: string
  toolbar?: React.ReactNode
  empty?: React.ReactNode
  caption?: string
}

export type DataTableSort = { id: string; direction: "asc" | "desc" } | null

export function nextSortState(current: DataTableSort, columnId: string): DataTableSort {
  if (!current || current.id !== columnId) return { id: columnId, direction: "asc" }
  if (current.direction === "asc") return { id: columnId, direction: "desc" }
  return null
}

export function sortRows<T>(
  columns: DataTableColumn<T>[],
  rows: T[],
  sort: DataTableSort,
): T[] {
  if (!sort) return rows
  const column = columns.find((item) => item.id === sort.id)
  if (!column) return rows
  return rows
    .slice()
    .sort((a, b) => compareValues(column.accessor(a), column.accessor(b), sort.direction))
}

export function buildCsvRows<T>(
  columns: DataTableColumn<T>[],
  rows: T[],
): Array<Array<string | number | null | undefined>> {
  const exported = columns.filter((column) => column.csv !== false)
  const header = exported.map((column) => column.header)
  const body = rows.map((row) => exported.map((column) => toCsvCell(column.accessor(row))))
  return [header, ...body]
}

function toCsvCell(value: AccessorValue): string | number | null | undefined {
  if (value == null) return value
  if (value instanceof Date) return formatIsoDate(value)
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return value
}

function formatIsoDate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function displayValue(value: AccessorValue): string {
  if (value == null) return ""
  if (value instanceof Date) return formatDateShort(value)
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return String(value)
}

function columnClassName<T>(column: DataTableColumn<T>): string {
  return cn(
    column.align === "right" && "num text-right",
    column.align === "center" && "text-center",
    column.className,
  )
}

function FirstCellActivator({
  align,
  onActivate,
  children,
}: {
  align: "left" | "right" | "center"
  onActivate: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        "block w-full cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
      )}
      onClick={(event) => {
        event.stopPropagation()
        onActivate()
      }}
    >
      {children}
    </button>
  )
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  initialSort,
  stickyHeader = true,
  maxHeight,
  csvFilename,
  toolbar,
  empty,
  caption,
}: DataTableProps<T>) {
  const [sort, setSort] = React.useState<DataTableSort>(initialSort ?? null)
  const sortedRows = React.useMemo(
    () => sortRows(columns, rows, sort),
    [columns, rows, sort],
  )

  const columnDefs = React.useMemo<ColumnDef<T, AccessorValue>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        accessorFn: (row) => column.accessor(row),
        header: column.header,
        enableSorting: false,
      })),
    [columns],
  )

  const table = useReactTable({
    data: sortedRows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => getRowId(row),
  })

  const showToolbar = toolbar != null || csvFilename != null

  return (
    <div>
      {showToolbar ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">{toolbar}</div>
          {csvFilename ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rows.length === 0}
              onClick={() => downloadCsvRows(buildCsvRows(columns, sortedRows), csvFilename)}
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-card border border-border bg-card">
        <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
          <table className="w-full caption-bottom text-sm">
            {caption ? <caption className="sr-only">{caption}</caption> : null}
            <TableHeader sticky={stickyHeader}>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const column = columns.find((item) => item.id === header.column.id)
                    if (!column) return null
                    if (column.sortable === false) {
                      return (
                        <TableHead
                          key={header.id}
                          align={column.align}
                          className={columnClassName(column)}
                        >
                          {column.header}
                        </TableHead>
                      )
                    }
                    const direction: SortDirection =
                      sort?.id === column.id ? sort.direction : null
                    return (
                      <SortableTableHeader
                        key={header.id}
                        label={column.header}
                        direction={direction}
                        onToggle={() => setSort((current) => nextSortState(current, column.id))}
                        align={column.align}
                        className={columnClassName(column)}
                      />
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {sortedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length}>
                    {empty ?? <EmptyState title="Nothing to show" />}
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((tableRow) => {
                  const row = tableRow.original
                  return (
                    <TableRow
                      key={getRowId(row)}
                      className={onRowClick ? "cursor-pointer" : undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {columns.map((column, index) => {
                        const content = column.cell
                          ? column.cell(row)
                          : displayValue(column.accessor(row))
                        return (
                          <TableCell key={column.id} className={columnClassName(column)}>
                            {onRowClick && index === 0 ? (
                              <FirstCellActivator
                                align={column.align ?? "left"}
                                onActivate={() => onRowClick(row)}
                              >
                                {content}
                              </FirstCellActivator>
                            ) : (
                              content
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </table>
        </div>
      </div>
    </div>
  )
}
