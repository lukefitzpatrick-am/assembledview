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
import { formatCurrencyAUD } from "@/lib/format/currency"
import { assignEntityColors } from "@/lib/charts/registry"
import { truncateLabel, useResponsiveChartHeight } from "@/lib/charts/responsive"
import { pickContrastingTextColorForFill } from "@/lib/charts/textOnFill"
import { cn } from "@/lib/utils"

type TreemapShellDatum = PieChartData & { fill: string }

function TreemapShellCell(props: {
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

  const resolvedFill = fill ?? "hsl(var(--muted))"
  const labelColor = pickContrastingTextColorForFill(resolvedFill)

  return (
    <g className="recharts-layer">
      <rect
        x={rx}
        y={ry}
        width={rw}
        height={rh}
        fill={resolvedFill}
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
            className={cn(
              "flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[2px] px-1 text-center font-sans font-semibold leading-tight",
              labelColor == null && "text-foreground",
            )}
            style={{
              fontSize: `${fontPx}px`,
              lineHeight: showLabel ? 1.25 : 1.2,
              WebkitFontSmoothing: "subpixel-antialiased",
              ...(labelColor ? { color: labelColor } : {}),
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

export type TreemapShellChartProps = {
  title: string
  description?: string
  data: PieChartData[]
  /** When set, these colours override the default palette for matching `name` keys. */
  colorByName?: Record<string, string>
  formatValue?: (value: number) => string
  onDatumClick?: (payload: ChartDatumClickPayload) => void
  getDatumId?: (payload: ChartDatumClickCore) => string
  className?: string
  chartAreaClassName?: string
}

export function TreemapShellChart({
  title,
  description,
  data,
  colorByName,
  formatValue = formatCurrencyAUD,
  onDatumClick,
  getDatumId,
  className,
  chartAreaClassName,
}: TreemapShellChartProps) {
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

  const treemapData: TreemapShellDatum[] = useMemo(
    () =>
      data.map((d) => {
        const pct =
          total > 0 ? ((Number(d.value) || 0) / total) * 100 : d.percentage ?? 0
        const profileFill = colorByName?.[d.name]
        return {
          name: d.name,
          value: d.value,
          percentage: pct,
          fill:
            profileFill ||
            colorMap.get(d.name) ||
            "hsl(var(--muted-foreground))",
        }
      }),
    [colorByName, colorMap, data, total]
  )

  const handleExportCsv = useCallback(() => {
    const columns = [
      { header: "Name", accessor: (row: TreemapShellDatum) => row.name },
      { header: "Value", accessor: (row: TreemapShellDatum) => row.value },
      {
        header: "Percentage",
        accessor: (row: TreemapShellDatum) =>
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
                props: TreemapShellDatum & {
                  x: number
                  y: number
                  width: number
                  height: number
                  index?: number
                }
              ) => (
                <TreemapShellCell
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
                  colorByName?.[name] ??
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
