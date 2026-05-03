"use client"

import { useMemo } from "react"
import { ResponsiveContainer, Tooltip, Treemap } from "recharts"

import { useClientBrand } from "@/components/client-dashboard/ClientBrandProvider"
import { useUnifiedTooltip } from "@/components/charts/UnifiedTooltip"
import { treemapFillFromIntensity } from "@/lib/client-dashboard/chartColorFormat"
import { getChartPalette } from "@/lib/client-dashboard/theme"
import { cn } from "@/lib/utils"

export type TreemapDatum = { name: string; size: number; intensity?: number }

type TreemapLeafProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  name?: string
  value?: number
  index?: number
  depth?: number
  payload?: TreemapDatum
  /** Flat treemap nodes merge datum fields onto the cloned props object. */
  intensity?: number
  size?: number
  primary: string
  palette: string[]
}

function TreemapLeaf({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name,
  value,
  index,
  payload,
  intensity: intensityProp,
  size: sizeProp,
  primary,
  palette,
}: TreemapLeafProps) {
  const ix = typeof index === "number" && !Number.isNaN(index) ? index : 0
  const intensity = intensityProp ?? payload?.intensity
  const fill =
    typeof intensity === "number"
      ? treemapFillFromIntensity(primary, intensity)
      : palette[ix % palette.length]

  const label = name ?? payload?.name ?? ""
  const showLabel = width >= 60 && height >= 40
  const rx = Math.round(x)
  const ry = Math.round(y)
  const rw = Math.max(0, Math.round(width))
  const rh = Math.max(0, Math.round(height))

  return (
    <g className="recharts-layer">
      <rect
        x={rx}
        y={ry}
        width={rw}
        height={rh}
        fill={fill}
        stroke="hsl(var(--border))"
        strokeWidth={1}
        rx={2}
        ry={2}
      />
      {showLabel && rw > 4 && rh > 4 ? (
        <foreignObject x={rx} y={ry} width={rw} height={rh} className="pointer-events-none">
          <div
            className={cn(
              "flex h-full w-full flex-col items-center justify-center overflow-hidden px-1 text-center text-[11px] font-medium leading-tight text-foreground",
            )}
          >
            <span className="block max-w-full truncate">{label}</span>
            <span className="block max-w-full truncate tabular-nums text-muted-foreground">
              {typeof value === "number"
                ? value.toLocaleString()
                : typeof sizeProp === "number"
                  ? sizeProp.toLocaleString()
                  : ""}
            </span>
          </div>
        </foreignObject>
      ) : null}
    </g>
  )
}

export type TreemapChartProps = {
  data: TreemapDatum[]
  height?: number
}

export function TreemapChart({ data, height = 320 }: TreemapChartProps) {
  const theme = useClientBrand()
  const palette = useMemo(() => getChartPalette(theme), [theme])

  const content = useMemo(
    () => <TreemapLeaf primary={theme.primary} palette={palette} />,
    [palette, theme.primary],
  )

  const totalSize = useMemo(
    () => data.reduce((s, d) => s + (Number(d.size) || 0), 0),
    [data],
  )

  const renderTooltip = useUnifiedTooltip({
    formatValue: (v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 }),
    showPercentages: true,
    getSeriesTotal: () => totalSize,
  })

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={data}
          dataKey="size"
          nameKey="name"
          stroke="hsl(var(--border))"
          aspectRatio={4 / 3}
          isAnimationActive={false}
          content={content}
        >
          <Tooltip content={renderTooltip} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  )
}

/** @deprecated Use `TreemapChart` — renamed in chart consolidation. */
export const TreemapViz = TreemapChart

/** @deprecated Use `TreemapChartProps` */
export type TreemapVizProps = TreemapChartProps
