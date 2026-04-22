"use client"

import { useMemo, useState } from "react"

import { CLIENT_DASHBOARD_FOCUS_RING } from "@/components/client-dashboard/focus-styles"
import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import { getChartPalette } from "@/lib/client-dashboard/theme"
import { cn } from "@/lib/utils"

export type NightingaleDatum = { label: string; value: number }

export type NightingaleChartProps = {
  data: NightingaleDatum[]
  size?: number
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  }
}

function wedgePath(cx: number, cy: number, innerR: number, outerR: number, startDeg: number, endDeg: number) {
  const startOuter = polarToCartesian(cx, cy, outerR, startDeg)
  const endOuter = polarToCartesian(cx, cy, outerR, endDeg)
  const startInner = polarToCartesian(cx, cy, innerR, endDeg)
  const endInner = polarToCartesian(cx, cy, innerR, startDeg)
  const largeArcFlag = endDeg - startDeg > 180 ? 1 : 0
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ")
}

export function NightingaleChart({ data, size = 360 }: NightingaleChartProps) {
  const theme = useClientBrand()
  const palette = useMemo(() => getChartPalette(theme), [theme])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const maxValue = useMemo(() => Math.max(1, ...data.map((d) => d.value)), [data])
  const gapDeg = 2
  const outer = size * 0.45
  const inner = size * 0.14
  const cx = size / 2
  const cy = size / 2
  const sliceWidth = data.length > 0 ? 360 / data.length : 0

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[30rem] shrink-0"
        style={{ aspectRatio: "1 / 1" }}
        role="img"
        aria-label="Nightingale chart"
      >
        {[0.33, 0.66, 1].map((ratio) => (
          <circle
            key={ratio}
            cx={cx}
            cy={cy}
            r={inner + (outer - inner) * ratio}
            fill="none"
            stroke="hsl(var(--border))"
            strokeDasharray="4 4"
          />
        ))}

        {data.map((d, i) => {
          const start = i * sliceWidth + gapDeg / 2
          const end = (i + 1) * sliceWidth - gapDeg / 2
          const radius = inner + (Math.max(0, d.value) / maxValue) * (outer - inner)
          const path = wedgePath(cx, cy, inner, radius, start, end)
          const fill = palette[i % palette.length]
          const highlighted = activeIndex === i
          return (
            <path
              key={d.label}
              d={path}
              fill={fill}
              opacity={highlighted || activeIndex == null ? 1 : 0.45}
              style={{ transition: "opacity 160ms ease" }}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
            />
          )
        })}
      </svg>

      <ul className="w-full min-w-0 space-y-1.5">
        {data.map((d, i) => {
          const isActive = activeIndex === i
          return (
            <li key={d.label}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm",
                  CLIENT_DASHBOARD_FOCUS_RING,
                  isActive && "bg-muted/60",
                )}
                onFocus={() => setActiveIndex(i)}
                onBlur={() => setActiveIndex(null)}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                aria-label={`${d.label} ${d.value.toLocaleString()}`}
              >
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: palette[i % palette.length] }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{d.label}</span>
                <span className="tabular-nums text-muted-foreground">{d.value.toLocaleString()}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
