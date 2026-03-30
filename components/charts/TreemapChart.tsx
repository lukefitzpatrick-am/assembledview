"use client"

import { useCallback, useMemo, useRef, type ReactElement } from "react"
import { ResponsiveContainer, Tooltip, Treemap } from "recharts"

import { ChartShell } from "@/components/charts/ChartShell"
import {
  finalizeChartDatumClickPayload,
  type ChartDatumClickCore,
  type ChartDatumClickPayload,
  type PieChartData,
} from "@/components/charts/chartDatumClick"
import { UnifiedTooltip } from "@/components/charts/UnifiedTooltip"
import { useChartExport } from "@/hooks/useChartExport"
import { useToast } from "@/components/ui/use-toast"
import { formatCurrencyAUD } from "@/lib/charts/format"
import { assignEntityColors } from "@/lib/charts/registry"
import { truncateLabel, useResponsiveChartHeight } from "@/lib/charts/responsive"
import { cn } from "@/lib/utils"

type TreemapDatum = PieChartData & { fill: string }

function TreemapCell(props: {
  x: number
  y: number
  width: number
  height: number
  name?: string
  value?: number
  index: number
  fill?: string
}) {
  const { x, y, width, height, name, value, fill } = props
  const safeName = name == null || name === "" ? "—" : String(name)
  const minSide = Math.min(width, height)
  const showLabel = minSide >= 44
  const fmt = formatCurrencyAUD(Number(value) || 0)
  const nameLine = showLabel ? truncateLabel(safeName, 14) : truncateLabel(safeName, 6)
  const fontPx = showLabel ? 12 : 10

  /** Snap rect to device pixels so strokes and the foreignObject box align cleanly. */
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
        fill={fill ?? "hsl(var(--muted))"}
        stroke="hsl(var(--background))"
        strokeWidth={2}
        rx={2}
        ry={2}
      />
      {minSide >= 28 && rw > 4 && rh > 4 ? (
        <foreignObject
          x={rx}
          y={ry}
          width={rw}
          height={rh}
          className="pointer-events-none"
        >
          <div
            className="flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[2px] px-1 text-center font-sans font-semibold leading-tight text-foreground"
            style={{
              fontSize: `${fontPx}px`,
              lineHeight: showLabel ? 1.25 : 1.2,
              WebkitFontSmoothing: "subpixel-antialiased",
            }}
          >
            {showLabel ? (
              <>
                <span className="block max-w-full truncate">{nameLine}</span>
                <span className="block max-w-full truncate tabular-nums">{fmt}</span>
              </>
            ) : (
              <span className="block max-w-full truncate">{nameLine}</span>
            )}
          </div>
        </foreignObject>
      ) : null}
    </g>
  )
}

export type TreemapChartProps = {
  title: string
  description?: string
  data: PieChartData[]
  formatValue?: (value: number) => string
  onDatumClick?: (payload: ChartDatumClickPayload) => void
  getDatumId?: (payload: ChartDatumClickCore) => string
  className?: string
  chartAreaClassName?: string
}

export function TreemapChart({
  title,
  description,
  data,
  formatValue = formatCurrencyAUD,
  onDatumClick,
  getDatumId,
  className,
  chartAreaClassName,
}: TreemapChartProps) {
  const chartAreaRef = useRef<HTMLDivElement | null>(null)
  const chartHeight = useResponsiveChartHeight(chartAreaRef)
  const { exportCsv } = useChartExport()
  const { toast } = useToast()

  const total = useMemo(
    () => data.reduce((s, d) => s + (Number(d.value) || 0), 0),
    [data]
  )

  const colorMap = useMemo(
    () => assignEntityColors(data.map((d) => d.name), "media"),
    [data]
  )

  const treemapData: TreemapDatum[] = useMemo(
    () =>
      data.map((d) => {
        const pct =
          total > 0 ? ((Number(d.value) || 0) / total) * 100 : d.percentage ?? 0
        return {
          name: d.name,
          value: d.value,
          percentage: pct,
          fill: colorMap.get(d.name) ?? "hsl(var(--muted-foreground))",
        }
      }),
    [colorMap, data, total]
  )

  const handleExportCsv = useCallback(() => {
    const columns = [
      { header: "Name", accessor: (row: TreemapDatum) => row.name },
      { header: "Value", accessor: (row: TreemapDatum) => row.value },
      {
        header: "Percentage",
        accessor: (row: TreemapDatum) =>
          `${total > 0 ? ((Number(row.value) || 0) / total) * 100 : 0}%`,
      },
    ]
    exportCsv(treemapData, columns, `${title.toLowerCase().replace(/\s+/g, "-")}.csv`)
    toast({ title: "CSV exported", description: `${title} data has been downloaded.` })
  }, [exportCsv, title, toast, total, treemapData])

  const handleClick = (node: { name?: string; value?: number; index?: number }) => {
    if (!onDatumClick) return
    const name = String(node.name ?? "")
    const value = Number(node.value) || 0
    const index = typeof node.index === "number" ? node.index : data.findIndex((d) => d.name === name)
    const datum = data[index] ?? { name, value, percentage: total > 0 ? (value / total) * 100 : 0 }
    onDatumClick(
      finalizeChartDatumClickPayload(
        {
          chart: "treemap",
          source: "cell",
          name,
          value,
          percentage: total > 0 ? (value / total) * 100 : 0,
          index: index >= 0 ? index : 0,
          datum,
        },
        getDatumId
      )
    )
  }

  const ariaLabel = `${title}: treemap of ${data.length} categories`

  return (
    <ChartShell
      title={title}
      description={description}
      className={className}
      chartAreaRef={chartAreaRef}
      chartAreaClassName={cn("min-h-0 w-full", chartAreaClassName)}
      chartAreaStyle={{ height: chartHeight }}
      onExportCsv={handleExportCsv}
    >
      <div
        className="h-full w-full min-h-[200px]"
        role="img"
        aria-label={ariaLabel}
      >
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treemapData}
            dataKey="value"
            nameKey="name"
            type="flat"
            aspectRatio={4 / 3}
            stroke="hsl(var(--background))"
            isAnimationActive
            onClick={(node) => handleClick(node)}
            content={
              ((
                props: TreemapDatum & {
                  x: number
                  y: number
                  width: number
                  height: number
                  index?: number
                }
              ) => (
                <TreemapCell
                  x={props.x}
                  y={props.y}
                  width={props.width}
                  height={props.height}
                  name={props.name}
                  value={props.value}
                  index={props.index ?? 0}
                  fill={props.fill}
                />
              )) as unknown as ReactElement
            }
          >
            <Tooltip
              content={(props: {
                active?: boolean
                payload?: Array<{ name?: string; value?: number; payload?: { fill?: string } }>
              }) => {
                if (!props.active || !props.payload?.[0]) return null
                const row = props.payload[0]
                const name = String(row.name ?? "")
                const value = Number(row.value) || 0
                const color =
                  row.payload?.fill ??
                  colorMap.get(name) ??
                  "hsl(var(--muted-foreground))"
                return (
                  <UnifiedTooltip
                    active
                    label={name}
                    payload={[{ name, value, color }]}
                    formatValue={formatValue}
                    showPercentages
                    seriesTotal={total}
                    maxItems={8}
                  />
                )
              }}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  )
}
