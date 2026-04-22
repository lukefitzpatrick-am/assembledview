"use client"

import { useMemo, useState } from "react"

import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import { parseHexRgb } from "@/lib/client-dashboard/chartColorFormat"
import { cn } from "@/lib/utils"

export type TimeHeatmapProps = {
  data: number[][]
  rowLabels: string[]
  colLabels: string[]
  theme?: { primary?: string }
}

function toRgbaFromHex(hex: string, alpha: number): string {
  const rgb = parseHexRgb(hex)
  if (!rgb) {
    return `hsl(var(--muted) / ${Math.min(1, Math.max(0, alpha))})`
  }
  const a = Math.min(1, Math.max(0, alpha))
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`
}

export function TimeHeatmap({ data, rowLabels, colLabels, theme }: TimeHeatmapProps) {
  const brand = useClientBrand()
  const primary = theme?.primary ?? brand.primary
  const [hovered, setHovered] = useState<{ r: number; c: number; value: number } | null>(null)

  const flat = useMemo(() => data.flatMap((row) => row), [data])
  const min = flat.length > 0 ? Math.min(...flat) : 0
  const max = flat.length > 0 ? Math.max(...flat) : 1
  const range = max - min

  const swatches = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    color: toRgbaFromHex(primary, 0.1 + ratio * 0.9),
  }))

  return (
    <div className="space-y-3">
      <div
        className="grid gap-1 overflow-auto rounded-md border border-border bg-card p-2"
        style={{
          gridTemplateColumns: `minmax(7rem, auto) repeat(${colLabels.length}, minmax(1.2rem, 1fr))`,
          alignItems: "center",
        }}
      >
        <div />
        {colLabels.map((label) => (
          <div key={label} className="text-center text-[0.65rem] font-medium text-muted-foreground">
            {label}
          </div>
        ))}

        {data.map((row, r) => (
          <div key={rowLabels[r] ?? r} className="contents">
            <div className="pr-2 text-xs font-medium text-muted-foreground">{rowLabels[r] ?? `Row ${r + 1}`}</div>
            {row.map((value, c) => {
              const ratio = range <= 0 ? 0 : (value - min) / range
              const bg = toRgbaFromHex(primary, 0.1 + ratio * 0.9)
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  className={cn(
                    "h-5 rounded-[3px] transition-transform duration-100 hover:scale-110 focus-visible:scale-110 focus-visible:outline-none",
                  )}
                  style={{ backgroundColor: bg }}
                  onMouseEnter={() => setHovered({ r, c, value })}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered({ r, c, value })}
                  onBlur={() => setHovered(null)}
                  aria-label={`${rowLabels[r] ?? `Row ${r + 1}`}, ${colLabels[c] ?? `Column ${c + 1}`}, value ${value}`}
                />
              )
            })}
          </div>
        ))}
      </div>

      {hovered ? (
        <div className="rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground">
          <span className="font-medium">{rowLabels[hovered.r] ?? `Row ${hovered.r + 1}`}</span>
          {" · "}
          <span className="font-medium">{colLabels[hovered.c] ?? `Col ${hovered.c + 1}`}</span>
          {" · "}
          <span className="tabular-nums">{hovered.value.toLocaleString()}</span>
        </div>
      ) : null}

      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">Low to high</div>
        <div className="grid grid-cols-5 gap-1">
          {swatches.map((sw) => (
            <div
              key={sw.ratio}
              className="h-4 rounded-sm border border-border/50"
              style={{ backgroundColor: sw.color }}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </div>
  )
}
