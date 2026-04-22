"use client"

import { useMemo } from "react"

import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { heatmapHexWithAlphaSuffix } from "@/lib/client-dashboard/chartColorFormat"
import { cn } from "@/lib/utils"

export type HeatmapColumnDef = {
  key: string
  label: string
  align?: "left" | "right" | "center"
  mono?: boolean
  heatmap?: boolean
  /** Base hex from brand theme; falls back to `theme.primary` when omitted. */
  heatmapColor?: string
  format?: (value: unknown, row: Record<string, unknown>) => string
}

export type HeatmapTableProps = {
  data: Record<string, unknown>[]
  columns: HeatmapColumnDef[]
  className?: string
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && !Number.isNaN(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }
  return null
}

export function HeatmapTable({ data, columns, className }: HeatmapTableProps) {
  const theme = useClientBrand()

  const ranges = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>()
    for (const col of columns) {
      if (!col.heatmap) continue
      let min = Number.POSITIVE_INFINITY
      let max = Number.NEGATIVE_INFINITY
      for (const row of data) {
        const n = toNumber(row[col.key])
        if (n == null) continue
        min = Math.min(min, n)
        max = Math.max(max, n)
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        map.set(col.key, { min: 0, max: 0 })
      } else {
        map.set(col.key, { min, max })
      }
    }
    return map
  }, [columns, data])

  const alignClass = (a?: HeatmapColumnDef["align"]) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left"

  return (
    <Table className={cn("border-collapse text-sm", className)}>
      <TableHeader className="sticky top-0 z-10 bg-card shadow-sm [&_tr]:border-b">
        <TableRow className="hover:bg-transparent">
          {columns.map((col) => (
            <TableHead key={col.key} className={cn("whitespace-nowrap", alignClass(col.align))}>
              {col.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, ri) => (
          <TableRow key={ri}>
            {columns.map((col) => {
              const raw = row[col.key]
              const text = col.format ? col.format(raw, row) : raw == null ? "" : String(raw)
              const n = toNumber(raw)
              let bg: string | undefined
              if (col.heatmap && n != null) {
                const { min, max } = ranges.get(col.key) ?? { min: 0, max: 0 }
                const ratio = max === min ? 0 : (n - min) / (max - min)
                const base = col.heatmapColor ?? theme.primary
                bg = heatmapHexWithAlphaSuffix(base, ratio)
              }
              return (
                <TableCell
                  key={col.key}
                  className={cn(alignClass(col.align), col.mono && "font-mono tabular-nums")}
                  style={bg ? { backgroundColor: bg } : undefined}
                >
                  {text}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
