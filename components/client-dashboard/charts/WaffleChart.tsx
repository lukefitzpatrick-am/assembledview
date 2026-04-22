"use client"

import { useMemo, useState } from "react"

import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import { CLIENT_DASHBOARD_FOCUS_RING } from "@/components/client-dashboard/focus-styles"
import { getChartPalette } from "@/lib/client-dashboard/theme"
import { cn } from "@/lib/utils"

const EMPTY_CELL = "#E2E8F0"

export type WaffleDatum = { label: string; pct: number }

export type WaffleChartProps = {
  data: WaffleDatum[]
  totalCells?: number
}

type Bucket = {
  label: string
  color: string
  count: number
}

function allocateCounts(data: WaffleDatum[], totalCells: number): number[] {
  const floats = data.map((d) => Math.max(0, d.pct) * totalCells / 100)
  const base = floats.map((n) => Math.floor(n))
  let assigned = base.reduce((sum, n) => sum + n, 0)
  const order = floats
    .map((f, i) => ({ i, frac: f - Math.floor(f) }))
    .sort((a, b) => b.frac - a.frac)
  let ptr = 0
  while (assigned < totalCells && ptr < order.length) {
    base[order[ptr].i] += 1
    assigned += 1
    ptr += 1
  }
  return base
}

export function WaffleChart({ data, totalCells = 100 }: WaffleChartProps) {
  const theme = useClientBrand()
  const palette = useMemo(() => getChartPalette(theme), [theme])
  const [activeLabel, setActiveLabel] = useState<string | null>(null)

  const cols = Math.max(1, Math.ceil(Math.sqrt(totalCells)))
  const rows = Math.max(1, Math.ceil(totalCells / cols))

  const buckets = useMemo<Bucket[]>(() => {
    const counts = allocateCounts(data, totalCells)
    return data.map((d, i) => ({
      label: d.label,
      color: palette[i % palette.length],
      count: counts[i] ?? 0,
    }))
  }, [data, palette, totalCells])

  const cells = useMemo(() => {
    const filled: { label: string; color: string }[] = []
    for (const b of buckets) {
      for (let i = 0; i < b.count; i += 1) {
        filled.push({ label: b.label, color: b.color })
      }
    }
    while (filled.length < totalCells) {
      filled.push({ label: "Remaining", color: EMPTY_CELL })
    }
    return filled.slice(0, totalCells)
  }, [buckets, totalCells])

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <div
        className="grid w-full max-w-[28rem] gap-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        }}
      >
        {cells.map((c, idx) => {
          const isActive = activeLabel != null && activeLabel === c.label
          return (
            <button
              key={idx}
              type="button"
              className="aspect-square rounded-[2px] transition-transform duration-150"
              style={{
                backgroundColor: c.color,
                transform: isActive ? "scale(1.1)" : "scale(1)",
              }}
              onMouseEnter={() => setActiveLabel(c.label)}
              onMouseLeave={() => setActiveLabel(null)}
              onFocus={() => setActiveLabel(c.label)}
              onBlur={() => setActiveLabel(null)}
              aria-label={`${c.label} cell ${idx + 1} of ${totalCells}`}
            />
          )
        })}
      </div>

      <ul className="w-full min-w-0 space-y-1.5">
        {data.map((d, i) => {
          const isActive = activeLabel === d.label
          return (
            <li key={d.label}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                  CLIENT_DASHBOARD_FOCUS_RING,
                  isActive && "bg-muted/60",
                )}
                onFocus={() => setActiveLabel(d.label)}
                onBlur={() => setActiveLabel(null)}
                onMouseEnter={() => setActiveLabel(d.label)}
                onMouseLeave={() => setActiveLabel(null)}
                aria-label={`${d.label} ${d.pct}%`}
              >
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: palette[i % palette.length] }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{d.label}</span>
                <span className="tabular-nums text-muted-foreground">{`${d.pct.toFixed(1)}%`}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
