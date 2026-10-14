"use client"

import { useMemo } from "react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { BaseChartCard } from "@/components/charts/system"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { EmptyState } from "@/components/ui/states"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"

import { withDateLabels } from "./deliveryChartReshape"
import {
  DELIVERY_CHART_COLOUR,
  DELIVERY_CHART_HEIGHT_CLASS,
  blankFutureDays,
  countFutureBlanked,
  deliveryAxisPlan,
  type DeliveryAxisTick,
  deliveryChartEmptyCopy,
  deliveryFormatterName,
  formatDeliveryValue,
  paintSeries,
  rowsFromSpec,
  seriesFromSpec,
  todayLineDate,
  type DeliveryChartSize,
  type DeliveryChartSpec,
  type DeliveryDailyChartSeries,
  type DeliveryPaintSeries,
} from "./deliveryChartSpec"

export type { DeliveryChartSpec, DeliveryDailyChartSeries } from "./deliveryChartSpec"
export { DELIVERY_DAILY_METRIC_LINE_COLOR, DELIVERY_DAILY_METRIC_LINE_THEME_HEXES } from "./deliveryDailyChartColors"

export interface DeliveryDailyChartProps {
  /** When set, draws delivered / planned / cumulative pace from these points. */
  spec?: DeliveryChartSpec
  daily?: Array<Record<string, string | number>>
  series?: DeliveryDailyChartSeries[]
  asAtDate?: string | null
  /** @deprecated Ignored for paint. Channel colour stays on the section dot. */
  brandColour?: string
  size?: DeliveryChartSize
  /** Campaign start (ISO). Empty charts before this date say "Starts <date>". */
  startsOn?: string | null
  title?: string
  subtitle?: string
  /** MBA and channel key for the PNG and CSV file stem. */
  exportName?: { mba: string; channel: string }
}

type TooltipItem = {
  dataKey?: string | number
  value?: number | string | null
}

function DeliveryTooltip({
  active,
  payload,
  label,
  paint,
}: {
  active?: boolean
  payload?: TooltipItem[]
  label?: string
  paint: DeliveryPaintSeries[]
}) {
  if (!active || !payload?.length) return null
  const byKey = new Map(paint.map((item) => [item.key, item]))
  return (
    <div className="grid min-w-[8rem] gap-1 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-tooltip">
      <div>{label}</div>
      {payload.map((item) => {
        const key = String(item.dataKey ?? "")
        const series = byKey.get(key)
        if (!series || item.value == null || item.value === "") return null
        const numeric = Number(item.value)
        if (!Number.isFinite(numeric)) return null
        return (
          <div key={key} className="flex justify-between gap-3">
            <span>{series.label}</span>
            <span className="num">{formatDeliveryValue(series.format, numeric)}</span>
          </div>
        )
      })}
    </div>
  )
}

function LegendSwatch({ item }: { item: DeliveryPaintSeries }) {
  if (item.mark === "bar") {
    return (
      <span
        data-series-colour={item.colour}
        className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--av-chart-1)]"
      />
    )
  }
  if (item.mark === "dashed") {
    return (
      <span
        data-series-colour={item.colour}
        className="inline-block w-4 border-b-2 border-dashed border-[var(--av-chart-2)]"
      />
    )
  }
  if (item.colour === DELIVERY_CHART_COLOUR.cumulativePace) {
    return (
      <span
        data-series-colour={item.colour}
        className="inline-block h-0.5 w-4 bg-[var(--av-chart-3)]"
      />
    )
  }
  return (
    <span
      data-series-colour={item.colour}
      className="inline-block h-0.5 w-4 bg-[var(--av-ink)]"
    />
  )
}

function DeliveryDateTick({
  x = 0,
  y = 0,
  payload,
  ticks,
}: {
  x?: number
  y?: number
  payload?: { value?: string }
  ticks: Map<string, DeliveryAxisTick>
}) {
  const tick = ticks.get(String(payload?.value ?? ""))
  if (!tick) return <g />
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" className="num fill-muted-foreground text-[10px]">
        <tspan x="0" dy="12">
          {tick.day}
        </tspan>
        {tick.month ? (
          <tspan x="0" dy="12">
            {tick.month}
          </tspan>
        ) : null}
      </text>
    </g>
  )
}

export function DeliveryDailyChart({
  spec,
  daily = [],
  series = [],
  asAtDate = null,
  brandColour: _brandColour,
  size,
  startsOn,
  title,
  subtitle,
  exportName,
}: DeliveryDailyChartProps) {
  const resolvedSeries = spec ? seriesFromSpec(spec) : series
  const resolvedAsAt = spec?.asAtDate ?? asAtDate ?? null
  const resolvedSize = size ?? spec?.height ?? "channel"
  const resolvedTitle = title ?? spec?.title ?? "Daily delivery"
  const resolvedSubtitle = subtitle ?? spec?.summary ?? undefined
  const sourceRows = spec ? rowsFromSpec(spec) : daily

  const paint = useMemo(() => paintSeries(resolvedSeries), [resolvedSeries])
  const labelled = useMemo(
    () => withDateLabels(sourceRows.map((row) => ({ ...row }))),
    [sourceRows],
  )
  const plot = useMemo(
    () => blankFutureDays(labelled, resolvedAsAt, paint.map((item) => item.key)),
    [labelled, resolvedAsAt, paint],
  )
  const dates = plot.map((row) => String(row.date ?? ""))
  const axisPlan = useMemo(() => deliveryAxisPlan(dates), [dates])
  const axisTicks = useMemo(() => new Map(axisPlan.map((tick) => [tick.iso, tick])), [axisPlan])
  const today = todayLineDate(dates, resolvedAsAt)
  const hasRightAxis = paint.some((item) => item.axis === "right")

  const config = useMemo<ChartConfig>(() => {
    const next: ChartConfig = {}
    for (const item of paint) next[item.key] = { label: item.label, color: item.colour }
    return next
  }, [paint])

  if (sourceRows.length === 0 || paint.length === 0) {
    const message = deliveryChartEmptyCopy({
      startsOn,
      asAtDate: resolvedAsAt,
      todayISO: getMelbourneTodayISO(),
      empty: spec?.empty,
    })
    return (
      <BaseChartCard
        title={resolvedTitle}
        subtitle={resolvedSubtitle}
        exportPage={exportName?.mba ?? "pacing"}
        exportTitle={exportName ? `${exportName.channel} daily delivery` : undefined}
        hideExport
      >
        <EmptyState
          className="min-h-[180px] border-0 bg-transparent"
          title={message}
          message={null}
        />
      </BaseChartCard>
    )
  }

  const legend = (
    <div
      data-legend-position="under-title"
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      {paint.map((item) => (
        <span
          key={item.key}
          data-series-key={item.key}
          data-series-mark={item.mark}
          data-series-format={deliveryFormatterName(item.format)}
          className="inline-flex items-center gap-1.5"
        >
          <LegendSwatch item={item} />
          {item.label}
        </span>
      ))}
    </div>
  )

  return (
    <BaseChartCard
      title={resolvedTitle}
      subtitle={resolvedSubtitle}
      exportPage={exportName?.mba ?? "pacing"}
      exportTitle={exportName ? `${exportName.channel} daily delivery` : undefined}
      legend={legend}
      exportSeries={{
        data: labelled,
        xKey: "dateLabel",
        seriesKeys: paint.map((item) => item.key),
      }}
    >
      <div
        className={`w-full ${DELIVERY_CHART_HEIGHT_CLASS[resolvedSize]}`}
        data-delivery-chart-size={resolvedSize}
        data-export-mba={exportName?.mba ?? ""}
        data-export-channel={exportName?.channel ?? ""}
        data-axis-domain="0"
        data-today-line={today ?? ""}
        data-future-blank-count={countFutureBlanked(labelled, resolvedAsAt)}
      >
        <ChartContainer config={config} className="aspect-auto h-full w-full">
          <ComposedChart data={plot} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              ticks={axisPlan.map((tick) => tick.iso)}
              tick={<DeliveryDateTick ticks={axisTicks} />}
              interval={0}
              height={40}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              domain={[0, "auto"]}
              tickFormatter={(value: number) =>
                formatDeliveryValue(paint.find((item) => item.axis === "left")?.format ?? "dollars", Number(value))
              }
              width={48}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            {hasRightAxis ? (
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, "auto"]}
                tickFormatter={(value: number) =>
                  formatDeliveryValue(paint.find((item) => item.axis === "right")?.format ?? "compact", Number(value))
                }
                width={44}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
            ) : null}
            <Tooltip content={<DeliveryTooltip paint={paint} />} />
            {paint.map((item) =>
              item.mark === "bar" ? (
                <Bar
                  key={item.key}
                  yAxisId="left"
                  dataKey={item.key}
                  name={item.label}
                  fill={item.colour}
                  maxBarSize={28}
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={item.key}
                  yAxisId={item.axis === "right" ? "right" : "left"}
                  type="monotone"
                  dataKey={item.key}
                  name={item.label}
                  stroke={item.colour}
                  strokeWidth={2}
                  strokeDasharray={item.mark === "dashed" ? "4 4" : undefined}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ),
            )}
            {today ? (
              <ReferenceLine
                x={today}
                yAxisId="left"
                stroke={DELIVERY_CHART_COLOUR.today}
                strokeDasharray="4 4"
              />
            ) : null}
          </ComposedChart>
        </ChartContainer>
      </div>
    </BaseChartCard>
  )
}
