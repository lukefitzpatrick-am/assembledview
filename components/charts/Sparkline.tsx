/** Plain SVG sparkline; fills container width, fixed visual height (default 44px). */
"use client"

import { formatNumberAU } from "@/lib/format/chartFormat"
import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react"

const DEFAULT_HEIGHT = 44
const DEFAULT_STROKE_WIDTH = 1.5

const VIEW_W = 1000
const VIEW_H = 100

export interface SparklineProps {
  data: number[]
  /** Pixel height; default 44 (within 40–48px guidance). */
  height?: number
  strokeWidth?: number
  /** Optional per-point labels (e.g. month names); index aligns with `data`. */
  tooltipData?: Array<{ label: string; value: number }>
}

type Trend = "up" | "down" | "flat" | "stable" | "unknown"

function trendFromData(data: number[]): Trend {
  const finite = data.filter((n) => Number.isFinite(n))
  if (finite.length === 0) return "unknown"
  if (finite.length === 1) return "stable"
  const a = finite[finite.length - 2]!
  const b = finite[finite.length - 1]!
  const scale = Math.max(Math.abs(a), Math.abs(b), 1)
  const eps = scale * 1e-9
  if (b > a + eps) return "up"
  if (b < a - eps) return "down"
  return "flat"
}

function trendPhrase(trend: Trend): string {
  switch (trend) {
    case "up":
      return "trending up"
    case "down":
      return "trending down"
    case "flat":
      return "flat trend"
    case "stable":
      return "single value"
    default:
      return "no trend"
  }
}

type SparklineLayout = {
  values: number[]
  min: number
  max: number
  range: number
  padY: number
  innerH: number
  n: number
  xSpan: number
  yAt: (v: number) => number
  xAt: (i: number) => number
}

function sparklineLayout(data: number[]): SparklineLayout | null {
  if (data.length === 0) return null
  const values = data.map((v) => (Number.isFinite(v) ? v : 0))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const padY = VIEW_H * 0.08
  const innerH = VIEW_H - 2 * padY
  const n = values.length
  const xSpan = Math.max(n - 1, 1)

  const yAt = (v: number) => {
    const t = (v - min) / range
    return padY + (1 - t) * innerH
  }
  const xAt = (i: number) => (i / xSpan) * VIEW_W

  return { values, min, max, range, padY, innerH, n, xSpan, yAt, xAt }
}

function buildPathD(layout: SparklineLayout): string {
  const { values, n, yAt, xAt } = layout
  if (n === 1) {
    const y = yAt(values[0]!)
    return `M 0 ${y.toFixed(2)} L ${VIEW_W} ${y.toFixed(2)}`
  }

  return values
    .map((v, i) => {
      const x = xAt(i)
      const y = yAt(v)
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(" ")
}

function nearestIndex(viewX: number, layout: SparklineLayout): number {
  const { n, xSpan } = layout
  if (n <= 1) return 0
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < n; i++) {
    const xi = (i / xSpan) * VIEW_W
    const d = Math.abs(viewX - xi)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function latestFinite(data: number[]): number | null {
  for (let i = data.length - 1; i >= 0; i--) {
    const v = data[i]
    if (Number.isFinite(v)) return v
  }
  return null
}

function formatValue(n: number): string {
  return formatNumberAU(Number(n.toFixed(4)))
}

const TOOLTIP_CLASS =
  "pointer-events-none absolute z-10 min-w-[7rem] rounded-lg border border-border/50 bg-popover/80 px-2 py-1.5 text-xs text-popover-foreground shadow-md backdrop-blur"

export function Sparkline({
  data,
  height = DEFAULT_HEIGHT,
  strokeWidth = DEFAULT_STROKE_WIDTH,
  tooltipData,
}: SparklineProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null)

  const layout = useMemo(() => sparklineLayout(data), [data])
  const pathD = layout ? buildPathD(layout) : null
  const latest = latestFinite(data)
  const trend = trendFromData(data)

  const ariaLabel =
    latest === null
      ? "Sparkline: no data"
      : `Sparkline: latest value ${formatValue(latest)}, ${trendPhrase(trend)}`

  const onSvgMouseMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (!layout || !svgRef.current || !wrapRef.current) return
      const svgRect = svgRef.current.getBoundingClientRect()
      const wrapRect = wrapRef.current.getBoundingClientRect()
      const localX = e.clientX - svgRect.left
      const viewX = svgRect.width > 0 ? (localX / svgRect.width) * VIEW_W : 0
      const idx = nearestIndex(viewX, layout)
      setHoverIdx(idx)
      setTipPos({
        left: e.clientX - wrapRect.left,
        top: e.clientY - wrapRect.top,
      })
    },
    [layout],
  )

  const onSvgMouseLeave = useCallback(() => {
    setHoverIdx(null)
    setTipPos(null)
  }, [])

  const hoverPoint =
    layout && hoverIdx !== null
      ? {
          x: layout.xAt(hoverIdx),
          y: layout.yAt(layout.values[hoverIdx]!),
          value: layout.values[hoverIdx]!,
          label: tooltipData?.[hoverIdx]?.label ?? `Point ${hoverIdx + 1}`,
        }
      : null

  if (pathD === null) {
    return (
      <svg
        role="img"
        aria-label={ariaLabel}
        width="100%"
        height={height}
        className="block max-w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      />
    )
  }

  return (
    <div ref={wrapRef} className="relative inline-block w-full text-foreground">
      <svg
        ref={svgRef}
        role="img"
        aria-label={ariaLabel}
        width="100%"
        height={height}
        className="block max-w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        onMouseMove={onSvgMouseMove}
        onMouseLeave={onSvgMouseLeave}
      >
        <rect
          x={0}
          y={0}
          width={VIEW_W}
          height={VIEW_H}
          fill="transparent"
          className="cursor-crosshair"
        />
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="nonScalingStroke"
        />
        {hoverPoint !== null ? (
          <>
            <line
              x1={hoverPoint.x}
              y1={0}
              x2={hoverPoint.x}
              y2={VIEW_H}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="4 3"
              strokeOpacity={0.3}
              vectorEffect="nonScalingStroke"
            />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r={3} fill="currentColor" />
          </>
        ) : null}
      </svg>
      {hoverPoint !== null && tipPos !== null ? (
        <div
          className={TOOLTIP_CLASS}
          style={{
            left: tipPos.left,
            top: tipPos.top,
            transform: "translate(10px, calc(-100% - 6px))",
          }}
          role="tooltip"
        >
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block size-2 shrink-0 rounded-full bg-current"
              aria-hidden
            />
            <div className="min-w-0">
              <div className="truncate font-medium">{hoverPoint.label}</div>
              <div className="tabular-nums text-muted-foreground">
                {formatValue(hoverPoint.value)}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
