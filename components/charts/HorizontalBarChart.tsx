"use client"

import { useCallback, useMemo, useRef } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
  type HorizontalBarDatum,
} from "@/components/charts/chartDatumClick"
import {
  useUnifiedTooltip,
  type UnifiedTooltipRechartsProps,
} from "@/components/charts/UnifiedTooltip"
import { useChartExport } from "@/hooks/useChartExport"
import { useToast } from "@/components/ui/use-toast"
import { formatCurrencyAUD } from "@/lib/charts/format"
import { assignEntityColors } from "@/lib/charts/registry"
import {
  condenseSeriesData,
  getXAxisConfig,
  truncateLabel,
  useResponsiveChartBox,
} from "@/lib/charts/responsive"
import { cn } from "@/lib/utils"

export type HorizontalBarChartProps = {
  title: string
  description?: string
  data: HorizontalBarDatum[]
  maxBars?: number
  formatValue?: (value: number) => string
  onDatumClick?: (payload: ChartDatumClickPayload) => void
  getDatumId?: (payload: ChartDatumClickCore) => string
  className?: string
  chartAreaClassName?: string
}

export function HorizontalBarChart({
  title,
  description,
  data,
  maxBars = 10,
  formatValue = formatCurrencyAUD,
  onDatumClick,
  getDatumId,
  className,
  chartAreaClassName,
}: HorizontalBarChartProps) {
  const chartAreaRef = useRef<HTMLDivElement | null>(null)
  const { width: containerWidth, height: chartHeight } =
    useResponsiveChartBox(chartAreaRef)
  const { exportCsv } = useChartExport()
  const { toast } = useToast()

  const chartRows = useMemo(() => {
    const sorted = [...data].sort(
      (a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)
    )
    if (sorted.length <= maxBars) return sorted
    const asRecords = sorted.map(
      (r) => ({ name: r.name, value: r.value }) as Record<string, unknown>
    )
    const merged = condenseSeriesData(asRecords, "value", "name", maxBars)
    return merged.map((r) => ({
      name: String(r.name),
      value: Number(r.value) || 0,
    }))
  }, [data, maxBars])

  const total = useMemo(
    () => chartRows.reduce((s, r) => s + (Number(r.value) || 0), 0),
    [chartRows]
  )

  const colorMap = useMemo(
    () => assignEntityColors(chartRows.map((r) => r.name), "media"),
    [chartRows]
  )

  const yAxisConfig = useMemo(
    () =>
      getXAxisConfig(
        chartRows.length,
        containerWidth || chartAreaRef.current?.clientWidth || 0
      ),
    [chartRows.length, containerWidth]
  )

  const renderTooltip = useUnifiedTooltip({
    formatValue,
    showPercentages: true,
    maxItems: 16,
    getSeriesTotal: () => total,
  })

  const handleExportCsv = useCallback(() => {
    exportCsv(
      chartRows,
      [
        { header: "Name", accessor: "name" as const },
        { header: "Value", accessor: "value" as const },
      ],
      `${title.toLowerCase().replace(/\s+/g, "-")}.csv`
    )
    toast({ title: "CSV exported", description: `${title} data has been downloaded.` })
  }, [chartRows, exportCsv, title, toast])

  const handleBarClick = (row: HorizontalBarDatum, index: number) => {
    if (!onDatumClick) return
    onDatumClick(
      finalizeChartDatumClickPayload(
        {
          chart: "horizontalBar",
          source: "bar",
          name: row.name,
          value: Number(row.value) || 0,
          index,
          datum: row,
        },
        getDatumId
      )
    )
  }

  const ariaLabel = `${title}: horizontal bar chart, ${chartRows.length} items`

  const bottomPad = 8 + (yAxisConfig.height ?? 30)

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
          <BarChart
            layout="vertical"
            data={chartRows}
            margin={{ top: 8, right: 72, left: 8, bottom: bottomPad }}
            barCategoryGap="12%"
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) => formatValue(Number(v))}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={128}
              reversed
              interval={yAxisConfig.interval}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v) => truncateLabel(String(v), 22)}
            />
            <Tooltip
              content={(props) =>
                renderTooltip({
                  active: props.active,
                  label: props.label,
                  payload: props.payload as UnifiedTooltipRechartsProps["payload"],
                })
              }
            />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              cursor={onDatumClick ? "pointer" : "default"}
              onClick={(_data, index: number) => {
                const row = chartRows[index]
                if (row) handleBarClick(row, index)
              }}
            >
              {chartRows.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={colorMap.get(entry.name) ?? "hsl(var(--primary))"}
                />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v: number) => formatValue(Number(v) || 0)}
                className="fill-foreground text-[11px]"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartShell>
  )
}
