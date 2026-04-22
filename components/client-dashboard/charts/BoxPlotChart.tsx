"use client"

import { useMemo } from "react"

import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import { parseHexRgb } from "@/lib/client-dashboard/chartColorFormat"

const OUTLIER_ROSE = "#F43F5E"

export type BoxPlotDatum = {
  label: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
  outliers?: number[]
}

export type BoxPlotChartProps = {
  data: BoxPlotDatum[]
  height?: number
  valueFormatter?: (value: number) => string
}

function withOpacity(hex: string, opacity: number): string {
  const rgb = parseHexRgb(hex)
  if (!rgb) return `hsl(var(--muted) / ${opacity})`
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.min(1, Math.max(0, opacity))})`
}

export function BoxPlotChart({ data, height = 320, valueFormatter }: BoxPlotChartProps) {
  const theme = useClientBrand()
  const width = Math.max(360, data.length * 84 + 90)
  const pad = { top: 16, right: 12, bottom: 68, left: 54 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const ticks = 5

  const allValues = useMemo(
    () => data.flatMap((d) => [d.min, d.q1, d.median, d.q3, d.max, ...(d.outliers ?? [])]),
    [data],
  )
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const domainPad = (max - min || 1) * 0.08
  const yMin = min - domainPad
  const yMax = max + domainPad
  const yScale = (v: number) => pad.top + ((yMax - v) / (yMax - yMin || 1)) * innerH
  const xStep = innerW / Math.max(1, data.length)
  const fmt = valueFormatter ?? ((v: number) => v.toLocaleString())

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[320px]" role="img" aria-label="Box plot chart">
        {Array.from({ length: ticks }).map((_, i) => {
          const ratio = i / (ticks - 1)
          const value = yMax - ratio * (yMax - yMin)
          const y = yScale(value)
          return (
            <g key={i}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="hsl(var(--border))"
                strokeDasharray="4 4"
              />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {fmt(value)}
              </text>
            </g>
          )
        })}

        {data.map((d, i) => {
          const x = pad.left + xStep * i + xStep / 2
          const boxW = Math.min(32, xStep * 0.5)
          const q1y = yScale(d.q1)
          const q3y = yScale(d.q3)
          const medY = yScale(d.median)
          const minY = yScale(d.min)
          const maxY = yScale(d.max)
          return (
            <g key={d.label}>
              <line x1={x} x2={x} y1={maxY} y2={minY} stroke={theme.primaryDark} strokeWidth={1.25} />
              <line x1={x - boxW / 3} x2={x + boxW / 3} y1={maxY} y2={maxY} stroke={theme.primaryDark} strokeWidth={1.25} />
              <line x1={x - boxW / 3} x2={x + boxW / 3} y1={minY} y2={minY} stroke={theme.primaryDark} strokeWidth={1.25} />
              <rect
                x={x - boxW / 2}
                y={q3y}
                width={boxW}
                height={Math.max(1, q1y - q3y)}
                fill={withOpacity(theme.primary, 0.35)}
                stroke={theme.primaryDark}
                strokeWidth={1.5}
              />
              <line x1={x - boxW / 2} x2={x + boxW / 2} y1={medY} y2={medY} stroke={theme.primaryDark} strokeWidth={2.5} />
              {(d.outliers ?? []).map((out, idx) => (
                <circle
                  key={`${d.label}-${idx}`}
                  cx={x}
                  cy={yScale(out)}
                  r={3}
                  fill={OUTLIER_ROSE}
                  stroke="hsl(var(--background))"
                  strokeWidth={1}
                />
              ))}
              <text
                x={x}
                y={height - pad.bottom + 18}
                transform={`rotate(-14 ${x} ${height - pad.bottom + 18})`}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
