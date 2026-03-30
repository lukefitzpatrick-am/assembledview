"use client"

import { useCallback, useMemo, useRef } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { ChartShell } from "@/components/charts/ChartShell"
import {
  finalizeChartDatumClickPayload,
  type ChartDatumClickCore,
  type ChartDatumClickPayload,
  type WaterfallDatum,
} from "@/components/charts/chartDatumClick"
import { UnifiedTooltip } from "@/components/charts/UnifiedTooltip"
import { useChartExport } from "@/hooks/useChartExport"
import { useToast } from "@/components/ui/use-toast"
import { formatCurrencyAUD } from "@/lib/charts/format"
import { CHART_THRESHOLD } from "@/lib/charts/theme"
import { getXAxisConfig, useResponsiveChartBox } from "@/lib/charts/responsive"
import { cn } from "@/lib/utils"

type WaterfallRow = {
  name: string
  base: number
  bar: number
  fill: string
  cumulative: number
  delta: number
  raw: WaterfallDatum
  index: number
}

export type WaterfallChartProps = {
  title: string
  description?: string
  data: WaterfallDatum[]
  formatValue?: (value: number) => string
  onDatumClick?: (payload: ChartDatumClickPayload) => void
  getDatumId?: (payload: ChartDatumClickCore) => string
  className?: string
  chartAreaClassName?: string
}

export function WaterfallChart({
  title,
  description,
  data,
  formatValue = formatCurrencyAUD,
  onDatumClick,
  getDatumId,
  className,
  chartAreaClassName,
}: WaterfallChartProps) {
  const chartAreaRef = useRef<HTMLDivElement | null>(null)
  const { width: containerWidth, height: chartHeight } =
    useResponsiveChartBox(chartAreaRef)
  const { exportCsv } = useChartExport()
  const { toast } = useToast()

  const { rows, maxX } = useMemo(() => {
    let running = 0
    let max = 0
    const out: WaterfallRow[] = []
    data.forEach((item, index) => {
      if (item.type === "total") {
        running = item.value
        max = Math.max(max, running)
        out.push({
          name: item.name,
          base: 0,
          bar: item.value,
          fill: CHART_THRESHOLD.info,
          cumulative: running,
          delta: item.value,
          raw: item,
          index,
        })
        return
      }
      const prev = running
      running += item.value
      const lo = Math.min(prev, running)
      const hi = Math.max(prev, running)
      max = Math.max(max, hi)
      const fill =
        item.type === "increase"
          ? CHART_THRESHOLD.positive
          : CHART_THRESHOLD.critical
      out.push({
        name: item.name,
        base: lo,
        bar: hi - lo,
        fill,
        cumulative: running,
        delta: item.value,
        raw: item,
        index,
      })
    })
    return { rows: out, maxX: max * 1.05 || 1 }
  }, [data])

  const xAxisConfig = useMemo(
    () =>
      getXAxisConfig(
        rows.length,
        containerWidth || chartAreaRef.current?.clientWidth || 0
      ),
    [rows.length, containerWidth]
  )

  const handleExportCsv = useCallback(() => {
    exportCsv(
      data,
      [
        { header: "Name", accessor: "name" as const },
        { header: "Value", accessor: "value" as const },
        { header: "Type", accessor: "type" as const },
      ],
      `${title.toLowerCase().replace(/\s+/g, "-")}.csv`
    )
    toast({ title: "CSV exported", description: `${title} data has been downloaded.` })
  }, [data, exportCsv, title, toast])

  const handleBarClick = (row: WaterfallRow) => {
    if (!onDatumClick) return
    onDatumClick(
      finalizeChartDatumClickPayload(
        {
          chart: "waterfall",
          source: "segment",
          name: row.name,
          value: row.delta,
          index: row.index,
          datum: row.raw,
        },
        getDatumId
      )
    )
  }

  const ariaLabel = `${title}: waterfall chart, ${rows.length} steps`

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
        className="h-full w-full min-h-[220px]"
        role="img"
        aria-label={ariaLabel}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={rows}
            margin={{
              top: 8,
              right: 24,
              left: 8,
              bottom: 8 + (xAxisConfig.height ?? 30),
            }}
            barCategoryGap="18%"
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, maxX]}
              tickFormatter={(v) => formatValue(Number(v))}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              content={(props: {
                active?: boolean
                label?: string
                payload?: Array<{ payload?: WaterfallRow }>
              }) => {
                if (!props.active || !props.payload?.[0]) return null
                const row = props.payload[0].payload
                if (!row) return null
                return (
                  <UnifiedTooltip
                    active
                    label={row.name}
                    payload={[
                      {
                        name: row.raw.type === "total" ? "Total" : "Change",
                        value: row.delta,
                        color: row.fill,
                      },
                      {
                        name: "Running total",
                        value: row.cumulative,
                        color: CHART_THRESHOLD.info,
                      },
                    ]}
                    formatValue={formatValue}
                    showTotal={false}
                    showPercentages={false}
                    maxItems={8}
                  />
                )
              }}
            />
            <Bar
              stackId="wf"
              dataKey="base"
              fill="rgba(0,0,0,0)"
              isAnimationActive={false}
            />
            <Bar
              stackId="wf"
              dataKey="bar"
              radius={[0, 4, 4, 0]}
              cursor={onDatumClick ? "pointer" : "default"}
              onClick={(_state, index: number) => {
                const row = rows[index]
                if (row) handleBarClick(row)
              }}
            >
              {rows.map((r) => (
                <Cell key={`${r.name}-${r.index}`} fill={r.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  )
}
