'use client'

import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Line,
} from 'recharts'

import { ChartShell } from '@/components/charts/ChartShell'
import {
  finalizeChartDatumClickPayload,
  type ChartDatumClickCore,
  type ChartDatumClickPayload,
} from '@/components/charts/chartDatumClick'
import {
  useUnifiedTooltip,
  type UnifiedTooltipRechartsProps,
} from '@/components/charts/UnifiedTooltip'
import { useChartExport } from '@/hooks/useChartExport'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrencyAUD } from '@/lib/charts/format'
import { assignEntityColors } from '@/lib/charts/registry'
import {
  condenseSeriesData,
  getXAxisConfig,
  useResponsiveChartBox,
} from '@/lib/charts/responsive'
import { cn } from '@/lib/utils'

export interface StackedColumnData {
  month: string
  [key: string]: string | number
}

export interface StackedColumnComparisonDatum {
  month: string
  value: number
}

/** Column totals on-chart: `sparse` shows one total above each stack; `none` hides them. */
export type ChartLabelMode = 'sparse' | 'none'

interface StackedColumnChartProps {
  title: string
  description: string
  data: StackedColumnData[]
  /** Optional positional override; otherwise colours from `assignEntityColors`. */
  colors?: string[]
  /** Per-series hex (or CSS) colours; merged on top of the default palette for matching keys. */
  seriesColorByName?: Record<string, string>
  comparisonData?: StackedColumnComparisonDatum[]
  comparisonLabel?: string
  /** Default: sparse (single total label per column). */
  labelMode?: ChartLabelMode
  onExport?: () => void
  /** Fired when a stacked segment, or a legend item, is clicked. */
  onDatumClick?: (payload: ChartDatumClickPayload) => void
  /** Optional stable id for the datum; defaults are chart-specific (see `defaultChartDatumId` in chartDatumClick). */
  getDatumId?: (payload: ChartDatumClickCore) => string
  cardClassName?: string
  headerClassName?: string
  contentClassName?: string
  /** Extra classes on the chart-area wrapper (height comes from ResizeObserver). */
  chartAreaClassName?: string
}

const INTERACTIVE_HELPER_TEXT =
  'Interactive chart: click a segment or legend item to filter.'
const READONLY_HELPER_TEXT = 'Read-only chart: hover bars and legend for details.'

const formatCurrencyNoDecimals = (value: number) => formatCurrencyAUD(value)

function rowStackTotal(row: StackedColumnData, keys: string[]) {
  return keys.reduce((sum, key) => sum + (Number(row[key]) || 0), 0)
}

export const StackedColumnChart = forwardRef<HTMLDivElement, StackedColumnChartProps>(
  function StackedColumnChart(
    {
      title,
      description,
      data,
      colors: colorsOverride,
      seriesColorByName,
      comparisonData,
      comparisonLabel = 'Budget',
      labelMode = 'sparse',
      onExport,
      onDatumClick,
      getDatumId,
      cardClassName,
      headerClassName: _headerClassName,
      contentClassName,
      chartAreaClassName,
    },
    ref,
  ) {
    const chartAreaRef = useRef<HTMLDivElement | null>(null)
    const { width: containerWidth, height: chartHeight } =
      useResponsiveChartBox(chartAreaRef)
    const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set())
    const [hoveredSeries, setHoveredSeries] = useState<string | null>(null)
    const { exportCsv } = useChartExport()
    const { toast } = useToast()

    const rawMediaTypes = useMemo(
      () =>
        Array.from(
          new Set(
            data.flatMap((row) =>
              Object.keys(row).filter((key) => key !== 'month'),
            ),
          ),
        ),
      [data],
    )

    const { condensedSeriesKeys, chartData } = useMemo(() => {
      if (rawMediaTypes.length <= 12) {
        return {
          condensedSeriesKeys: rawMediaTypes,
          chartData: data,
        }
      }

      const seriesTotals = rawMediaTypes.map((name) => ({
        name,
        value: data.reduce((s, r) => s + (Number(r[name]) || 0), 0),
      })) as Record<string, unknown>[]

      const merged = condenseSeriesData(seriesTotals, 'value', 'name', 12)
      const condensedNames = merged.map((r) => String(r.name))
      const topIndividual = condensedNames.filter((n) => n !== 'Other')
      const otherSourceKeys = rawMediaTypes.filter((m) => !topIndividual.includes(m))

      const chartDataNext: StackedColumnData[] = data.map((row) => {
        const out: StackedColumnData = { month: row.month }
        for (const key of condensedNames) {
          if (key === 'Other') {
            out.Other = otherSourceKeys.reduce(
              (s, k) => s + (Number(row[k]) || 0),
              0,
            )
          } else {
            out[key] = row[key] ?? 0
          }
        }
        return out
      })

      return {
        condensedSeriesKeys: condensedNames,
        chartData: chartDataNext,
      }
    }, [data, rawMediaTypes])

    const fillMap = useMemo(() => {
      let base: Map<string, string>
      if (colorsOverride?.length) {
        base = new Map<string, string>()
        condensedSeriesKeys.forEach((k, i) => {
          base.set(k, colorsOverride[i % colorsOverride.length]!)
        })
      } else {
        base = assignEntityColors(condensedSeriesKeys, 'media')
      }
      if (seriesColorByName) {
        for (const k of condensedSeriesKeys) {
          const c = seriesColorByName[k]
          if (c) base.set(k, c)
        }
      }
      return base
    }, [colorsOverride, condensedSeriesKeys, seriesColorByName])

    const visibleMediaTypes = useMemo(
      () => condensedSeriesKeys.filter((s) => !hiddenSeries.has(s)),
      [condensedSeriesKeys, hiddenSeries],
    )

    const comparisonMap = useMemo(
      () =>
        new Map(
          (comparisonData ?? []).map((item) => [
            String(item.month),
            Number(item.value) || 0,
          ]),
        ),
      [comparisonData],
    )

    const rowTotalByMonth = useMemo(() => {
      const totals = new Map<string, number>()
      chartData.forEach((row) => {
        totals.set(
          String(row.month),
          rowStackTotal(row, visibleMediaTypes),
        )
      })
      return totals
    }, [chartData, visibleMediaTypes])

    const xAxisConfig = useMemo(
      () =>
        getXAxisConfig(
          chartData.length,
          containerWidth || chartAreaRef.current?.clientWidth || 0,
        ),
      [chartData.length, containerWidth],
    )

    const chartBottomMargin = 16 + (xAxisConfig.height ?? 30)

    const renderTooltip = useUnifiedTooltip({
      formatValue: formatCurrencyNoDecimals,
      showPercentages: true,
      maxItems: 20,
      getSeriesTotal: (month) => rowTotalByMonth.get(month),
      getComparison: (month) => {
        const v = comparisonMap.get(month)
        if (v === undefined) return undefined
        return { value: v, label: comparisonLabel }
      },
    })

    const handleStackedBarClick =
      (seriesKey: string) => (item: unknown, dataIndex: number, _e: MouseEvent) => {
        if (!onDatumClick) return
        const rect = item as { payload?: StackedColumnData }
        const row = rect.payload ?? chartData[dataIndex]
        if (!row) return
        const value = Number(row[seriesKey]) || 0
        const found = chartData.indexOf(row)
        const index = found >= 0 ? found : dataIndex
        onDatumClick(
          finalizeChartDatumClickPayload(
            {
              chart: 'stackedColumn',
              source: 'bar',
              name: seriesKey,
              value,
              category: String(row.month),
              index,
              datum: row,
            },
            getDatumId,
          ),
        )
      }

    const handleLegendToggle = useCallback(
      (key: string) => {
        if (!condensedSeriesKeys.includes(key)) return
        setHiddenSeries((prev) => {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
        if (onDatumClick) {
          onDatumClick(
            finalizeChartDatumClickPayload(
              {
                chart: 'stackedColumn',
                source: 'legend',
                name: key,
                value: 0,
                category: '',
                index: -1,
                datum: null,
              },
              getDatumId,
            ),
          )
        }
      },
      [condensedSeriesKeys, getDatumId, onDatumClick],
    )

    const handleExportCsv = useCallback(() => {
      if (onExport) {
        onExport()
        return
      }
      const columns: {
        header: string
        accessor: keyof StackedColumnData | ((row: StackedColumnData) => unknown)
      }[] = [
        { header: 'Month', accessor: 'month' },
        ...condensedSeriesKeys.map((key) => ({
          header: key,
          accessor: (row: StackedColumnData) => row[key] ?? 0,
        })),
      ]
      exportCsv(chartData, columns, `${title.toLowerCase().replace(/\s+/g, '-')}.csv`)
      toast({
        title: 'CSV exported',
        description: `${title} data has been downloaded.`,
      })
    }, [
      chartData,
      condensedSeriesKeys,
      exportCsv,
      onExport,
      title,
      toast,
    ])

    const topMediaType =
      visibleMediaTypes.length > 0
        ? visibleMediaTypes[visibleMediaTypes.length - 1]
        : undefined

    const stackTotalLabelContent = (props: {
      x?: number
      y?: number
      width?: number
      index?: number
    }) => {
      const { x, y, width, index } = props
      if (x == null || y == null || width == null || index == null) return null
      const row = chartData[index]
      if (!row) return null
      const total = rowStackTotal(row, visibleMediaTypes)
      if (total <= 0) return null
      return (
        <text
          x={x + width / 2}
          y={y}
          dy={-6}
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          className="text-[10px] font-medium"
        >
          {formatCurrencyNoDecimals(total)}
        </text>
      )
    }

    const legendItems = useMemo(
      () =>
        condensedSeriesKeys.map((name) => ({
          key: name,
          label: name,
          color: fillMap.get(name) ?? '#999',
        })),
      [condensedSeriesKeys, fillMap],
    )

    const setOuterRef = useCallback(
      (node: HTMLDivElement | null) => {
        if (typeof ref === 'function') {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      },
      [ref],
    )

    return (
      <div ref={setOuterRef}>
        <ChartShell
          title={title}
          description={description}
          className={cn(cardClassName)}
          chartAreaRef={chartAreaRef}
          chartAreaClassName={cn(
            'flex min-h-0 w-full flex-col',
            chartAreaClassName,
            contentClassName,
          )}
          chartAreaStyle={{ height: chartHeight }}
          onExportCsv={handleExportCsv}
          helperText={
            onDatumClick ? INTERACTIVE_HELPER_TEXT : READONLY_HELPER_TEXT
          }
        >
          <div className="min-h-0 min-w-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{
                top: 24,
                right: 24,
                left: 20,
                bottom: chartBottomMargin,
              }}
              barGap={8}
              barCategoryGap="22%"
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" {...xAxisConfig} />
              <YAxis
                tickFormatter={formatCurrencyNoDecimals}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                content={(props) => {
                  const stackPayload = (props.payload ?? []).filter((item) => {
                    if (item == null || typeof item !== 'object') return false
                    const p = item as { dataKey?: unknown; name?: unknown }
                    const key = String(p.dataKey ?? p.name ?? '')
                    return visibleMediaTypes.includes(key)
                  })
                  return renderTooltip({
                    ...props,
                    payload:
                      stackPayload as UnifiedTooltipRechartsProps['payload'],
                  })
                }}
              />
              {comparisonData && comparisonData.length > 0 ? (
                <Line
                  type="monotone"
                  dataKey={(row: StackedColumnData) =>
                    comparisonMap.get(String(row.month)) ?? null
                  }
                  name={comparisonLabel}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  dot={{ r: 2.5 }}
                  strokeWidth={2}
                  isAnimationActive
                />
              ) : null}
              {visibleMediaTypes.map((mediaType) => {
                const isTopSegment = mediaType === topMediaType
                return (
                  <Bar
                    key={mediaType}
                    dataKey={mediaType}
                    stackId="a"
                    fill={fillMap.get(mediaType) ?? '#999'}
                    name={mediaType}
                    radius={isTopSegment ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    isAnimationActive
                    style={{
                      filter:
                        hoveredSeries === mediaType
                          ? 'brightness(1.1)'
                          : 'brightness(1)',
                      transition: 'filter 150ms ease',
                    }}
                    cursor={onDatumClick ? undefined : 'default'}
                    onMouseEnter={() => setHoveredSeries(mediaType)}
                    onMouseLeave={() => setHoveredSeries(null)}
                    {...(onDatumClick ? { onClick: handleStackedBarClick(mediaType) } : {})}
                  >
                    {labelMode === 'sparse' && isTopSegment ? (
                      <LabelList dataKey={mediaType} content={stackTotalLabelContent} />
                    ) : null}
                  </Bar>
                )
              })}
            </BarChart>
            </ResponsiveContainer>
          </div>
          <ChartShell.Legend
            items={legendItems}
            hiddenKeys={hiddenSeries}
            onToggle={handleLegendToggle}
            className="mt-3"
          />
        </ChartShell>
      </div>
    )
  },
)

StackedColumnChart.displayName = 'StackedColumnChart'
