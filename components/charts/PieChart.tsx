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
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Sector,
} from 'recharts'

import { ChartShell } from '@/components/charts/ChartShell'
import {
  finalizeChartDatumClickPayload,
  type ChartDatumClickCore,
  type ChartDatumClickPayload,
  type PieChartData,
} from '@/components/charts/chartDatumClick'
import { useUnifiedTooltip } from '@/components/charts/UnifiedTooltip'
import { useChartExport } from '@/hooks/useChartExport'
import { useToast } from '@/components/ui/use-toast'
import { CHART_ANIMATION } from '@/lib/charts/dashboardTheme'
import { formatCurrencyAUD } from '@/lib/charts/format'
import { assignEntityColors } from '@/lib/charts/registry'
import {
  condenseSeriesData,
  useObservedSize,
  useResponsiveChartHeight,
} from '@/lib/charts/responsive'
import { CHART_RECHARTS_PLACEHOLDER_PURPLE } from '@/lib/charts/theme'
import { cn } from '@/lib/utils'

export type {
  ChartDatumClickCore,
  ChartDatumClickPayload,
  ChartStackedColumnRow,
  PieChartData,
} from '@/components/charts/chartDatumClick'
export { defaultChartDatumId, finalizeChartDatumClickPayload } from '@/components/charts/chartDatumClick'

/** On-chart slice labels: `sparse` shows percent only for slices ≥5%; `none` hides them. */
export type ChartLabelMode = 'sparse' | 'none'

interface PieChartProps {
  title: string
  description: string
  data: PieChartData[]
  /** Optional positional override; otherwise colours come from `assignEntityColors` (registry). */
  colors?: string[]
  /** Default: sparse (low-noise on-slice labels; detail in tooltip). */
  labelMode?: ChartLabelMode
  onExport?: () => void
  /** Fired when a slice or legend item is clicked. */
  onDatumClick?: (payload: ChartDatumClickPayload) => void
  /** Optional stable id for the datum; defaults are chart-specific (see `defaultChartDatumId`). */
  getDatumId?: (payload: ChartDatumClickCore) => string
  cardClassName?: string
  headerClassName?: string
  contentClassName?: string
  /** Outer plot + legend wrapper; default tall layout for standalone cards. */
  plotAreaClassName?: string
}

const INTERACTIVE_HELPER_TEXT =
  'Interactive chart: click a slice or legend item to filter.'
const READONLY_HELPER_TEXT = 'Read-only chart: hover slices and legend for details.'

const SLICE_LABEL_MIN_PCT = 0.08
const SLICE_SMALL_PCT = 0.12

export const PieChart = forwardRef<HTMLDivElement, PieChartProps>(function PieChart(
  {
    title,
    description,
    data,
    colors: colorsOverride,
    labelMode = 'sparse',
    onExport,
    onDatumClick,
    getDatumId,
    cardClassName,
    headerClassName: _headerClassName,
    contentClassName,
    plotAreaClassName,
  },
  ref,
) {
  const chartAreaRef = useRef<HTMLDivElement | null>(null)
  const piePlotRef = useRef<HTMLDivElement | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set())
  const { exportCsv } = useChartExport()
  const { toast } = useToast()

  const grandTotal = useMemo(
    () => data.reduce((sum, item) => sum + (Number(item.value) || 0), 0),
    [data],
  )

  const condensed = useMemo(() => {
    if (data.length <= 12) {
      return data.map((d) => ({ ...d }))
    }
    const rows = data.map((d) => ({ ...d } as Record<string, unknown>))
    const merged = condenseSeriesData(rows, 'value', 'name', 12)
    const t = merged.reduce((s, r) => s + (Number(r.value) || 0), 0)
    return merged.map((r) => ({
      name: String(r.name),
      value: Number(r.value) || 0,
      percentage: t > 0 ? ((Number(r.value) || 0) / t) * 100 : 0,
    })) as PieChartData[]
  }, [data])

  const fillMap = useMemo(() => {
    if (colorsOverride?.length) {
      const m = new Map<string, string>()
      condensed.forEach((d, i) => {
        m.set(d.name, colorsOverride[i % colorsOverride.length]!)
      })
      return m
    }
    return assignEntityColors(
      condensed.map((d) => d.name),
      'media',
    )
  }, [colorsOverride, condensed])

  const visibleData = useMemo(
    () => condensed.filter((d) => !hiddenKeys.has(d.name)),
    [condensed, hiddenKeys],
  )

  const visibleTotal = useMemo(
    () => visibleData.reduce((s, d) => s + (Number(d.value) || 0), 0),
    [visibleData],
  )

  const chartHeight = useResponsiveChartHeight(chartAreaRef)
  const plotSize = useObservedSize(piePlotRef)
  const hasPlotBox = plotSize.width > 0 && plotSize.height > 0
  const plotMin = hasPlotBox
    ? Math.min(plotSize.width, plotSize.height)
    : chartHeight
  /** Stay inside the square inscribed in the plot cell so labels and donut do not clip. */
  const outerCap = hasPlotBox ? plotMin / 2 - 10 : chartHeight * 0.42
  const outerRadius = Math.max(36, Math.min(plotMin * 0.38, outerCap))
  const innerRadius = Math.max(24, outerRadius * 0.52)

  const renderTooltip = useUnifiedTooltip({
    showPercentages: true,
    formatValue: formatCurrencyAUD,
    getSeriesTotal: (_label) => visibleTotal,
  })

  const slicePercentage = useCallback(
    (datum: PieChartData) =>
      grandTotal > 0 ? ((Number(datum.value) || 0) / grandTotal) * 100 : 0,
    [grandTotal],
  )

  const resolveClickIndex = useCallback(
    (datum: PieChartData) =>
      datum.name === 'Other' ? -1 : data.findIndex((d) => d.name === datum.name),
    [data],
  )

  const firePieDatum = useCallback(
    (datum: PieChartData, source: 'slice' | 'legend') => {
      if (!onDatumClick) return
      onDatumClick(
        finalizeChartDatumClickPayload(
          {
            chart: 'pie',
            source,
            name: datum.name,
            value: Number(datum.value) || 0,
            percentage: slicePercentage(datum),
            index: resolveClickIndex(datum),
            datum,
          },
          getDatumId,
        ),
      )
    },
    [getDatumId, onDatumClick, resolveClickIndex, slicePercentage],
  )

  const handlePieSliceClick = (
    sector: { payload?: PieChartData },
    index: number,
    _e: MouseEvent,
  ) => {
    const datum = sector?.payload ?? visibleData[index]
    if (!datum) return
    firePieDatum(datum, 'slice')
  }

  const handleLegendToggle = useCallback(
    (key: string) => {
      setHiddenKeys((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      const datum = condensed.find((d) => d.name === key)
      if (datum) firePieDatum(datum, 'legend')
    },
    [condensed, firePieDatum],
  )

  const handleExportCsv = useCallback(() => {
    if (onExport) {
      onExport()
      return
    }
    const csvColumns = [
      { header: 'Name', accessor: (row: PieChartData) => row.name },
      { header: 'Value', accessor: (row: PieChartData) => row.value },
      {
        header: 'Percentage',
        accessor: (row: PieChartData) =>
          `${slicePercentage(row).toFixed(1)}%`,
      },
    ]
    exportCsv(data, csvColumns, `${title.toLowerCase().replace(/\s+/g, '-')}.csv`)
    toast({
      title: 'CSV exported',
      description: `${title} data has been downloaded.`,
    })
  }, [data, exportCsv, onExport, slicePercentage, title, toast])

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

  const pieLabel =
    labelMode === 'none'
      ? false
      : ({
          percent,
          cx,
          cy,
          midAngle,
          innerRadius: ir,
          outerRadius: or,
        }: {
          percent: number
          cx: number
          cy: number
          midAngle: number
          innerRadius: number
          outerRadius: number
        }) => {
          if (percent < SLICE_LABEL_MIN_PCT) return null
          const RADIAN = Math.PI / 180
          const radius = ir + (or - ir) * 0.5
          const x = cx + radius * Math.cos(-midAngle * RADIAN)
          const y = cy + radius * Math.sin(-midAngle * RADIAN)
          const isSmallSlice = percent < SLICE_SMALL_PCT
          const outsideRadius = or + 16
          const outsideX = cx + outsideRadius * Math.cos(-midAngle * RADIAN)
          const outsideY = cy + outsideRadius * Math.sin(-midAngle * RADIAN)
          const anchor = outsideX > cx ? 'start' : 'end'
          return (
            <text
              x={isSmallSlice ? outsideX : x}
              y={isSmallSlice ? outsideY : y}
              fill="hsl(var(--foreground))"
              textAnchor={isSmallSlice ? anchor : x > cx ? 'start' : 'end'}
              dominantBaseline="central"
              className="text-[11px] font-medium"
            >
              {(percent * 100).toFixed(0)}%
            </text>
          )
        }

  const legendItems = useMemo(
    () =>
      condensed.map((d) => ({
        key: d.name,
        label: d.name,
        color: fillMap.get(d.name) ?? CHART_RECHARTS_PLACEHOLDER_PURPLE,
      })),
    [condensed, fillMap],
  )

  return (
    <div ref={setOuterRef}>
      <ChartShell
        title={title}
        description={description}
        className={cn(cardClassName)}
        chartAreaRef={chartAreaRef}
        chartAreaClassName={cn(
          'flex min-h-0 flex-col',
          contentClassName,
          plotAreaClassName,
        )}
        chartAreaStyle={{ height: chartHeight }}
        onExportCsv={handleExportCsv}
        helperText={onDatumClick ? INTERACTIVE_HELPER_TEXT : READONLY_HELPER_TEXT}
      >
        <div
          className={cn(
            'flex h-full min-h-0 flex-1 flex-col gap-3 md:flex-row md:items-stretch md:gap-4',
          )}
        >
          <div
            ref={piePlotRef}
            className="relative h-full min-h-[200px] min-w-0 flex-1 md:min-h-[200px]"
          >
            {visibleData.length === 0 ? (
              <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground">
                No slices visible — use the legend to show a category.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={visibleData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={pieLabel}
                    innerRadius={innerRadius}
                    outerRadius={outerRadius}
                    fill={CHART_RECHARTS_PLACEHOLDER_PURPLE}
                    dataKey="value"
                    nameKey="name"
                    isAnimationActive
                    animationDuration={CHART_ANIMATION.duration}
                    animationBegin={CHART_ANIMATION.delay}
                    activeIndex={activeIndex ?? undefined}
                    activeShape={(props: {
                      cx?: number
                      cy?: number
                      startAngle?: number
                      endAngle?: number
                      innerRadius?: number
                      outerRadius?: number
                      fill?: string
                    }) => {
                      const {
                        cx,
                        cy,
                        startAngle,
                        endAngle,
                        innerRadius: ir,
                        outerRadius: or,
                        fill,
                      } = props
                      if (
                        cx == null ||
                        cy == null ||
                        startAngle == null ||
                        endAngle == null ||
                        ir == null ||
                        or == null ||
                        !fill
                      ) {
                        return <g />
                      }
                      return (
                        <g
                          transform={`translate(${cx}, ${cy}) scale(1.02) translate(${-cx}, ${-cy})`}
                        >
                          <Sector
                            cx={cx}
                            cy={cy}
                            startAngle={startAngle}
                            endAngle={endAngle}
                            innerRadius={ir}
                            outerRadius={or}
                            fill={fill}
                            stroke="#fff"
                            strokeWidth={2}
                          />
                        </g>
                      )
                    }}
                    cursor={onDatumClick ? undefined : 'default'}
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                    {...(onDatumClick ? { onClick: handlePieSliceClick } : {})}
                  >
                    {visibleData.map((d) => (
                      <Cell
                        key={d.name}
                        fill={
                          fillMap.get(d.name) ?? CHART_RECHARTS_PLACEHOLDER_PURPLE
                        }
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={renderTooltip} />
                </RechartsPieChart>
              </ResponsiveContainer>
            )}
            {visibleData.length > 0 ? (
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                <p className="text-[11px] text-muted-foreground">Total</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatCurrencyAUD(visibleTotal)}
                </p>
              </div>
            ) : null}
          </div>
          <ChartShell.Legend
            items={legendItems}
            hiddenKeys={hiddenKeys}
            onToggle={handleLegendToggle}
            maxVisible={10}
            className="mt-0 md:w-[220px] md:flex-none md:flex-col md:items-stretch md:justify-start md:self-start"
          />
        </div>
      </ChartShell>
    </div>
  )
})

PieChart.displayName = 'PieChart'
