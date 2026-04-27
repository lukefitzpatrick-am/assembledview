"use client"

import React, { useMemo } from "react"
import { Area, CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { assignEntityColors } from "@/lib/charts/registry"
import { PACING_CHART_STROKE } from "@/lib/charts/dashboardTheme"
import {
  PACING_CARTESIAN_GRID_PROPS,
  PACING_TODAY_REFERENCE_LINE_PROPS,
} from "@/lib/charts/pacingLineChartStyle"
import { getMelbourneTodayISO } from "@/lib/pacing/pacingWindow"
import type { TargetCurvePoint } from "@/lib/kpi/deliveryTargetCurve"

function formatChartDateLabel(iso: string | undefined) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short" }).format(d)
}

function formatCompactNumber(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  return new Intl.NumberFormat("en-AU", { notation: "compact", maximumFractionDigits: 1 }).format(v)
}

export interface ActualsCumulativeVsTargetChartProps {
  targetCurve: TargetCurvePoint[]
  cumulativeActual: Array<{ date: string; actual: number }>
  asAtDate: string | null
  deliverableLabel: string
  chartRef?: React.Ref<HTMLDivElement>
  brandColour?: string
}

export function ActualsCumulativeVsTargetChart({
  targetCurve,
  cumulativeActual,
  asAtDate,
  deliverableLabel,
  chartRef,
  brandColour,
}: ActualsCumulativeVsTargetChartProps) {
  const refLineISO = asAtDate ?? getMelbourneTodayISO()

  const { targetColor, actualColor } = useMemo(() => {
    const t = brandColour ?? PACING_CHART_STROKE.expected
    const actualName = `${deliverableLabel} actual`
    const m = assignEntityColors([actualName], "generic")
    return {
      targetColor: t,
      actualColor: m.get(actualName) ?? PACING_CHART_STROKE.expected,
    }
  }, [deliverableLabel, brandColour])

  const merged = useMemo(() => {
    const actualByDate = new Map(cumulativeActual.map((r) => [r.date, r.actual]))
    return targetCurve.map((p) => ({
      date: p.date,
      target: p.target,
      targetLow: p.targetLow,
      targetHigh: p.targetHigh,
      actual: actualByDate.get(p.date) ?? 0,
    }))
  }, [targetCurve, cumulativeActual])

  const showTodayLine = useMemo(
    () => Boolean(refLineISO && merged.some((p) => p.date === refLineISO)),
    [merged, refLineISO],
  )

  const gradientId = useMemo(
    () => `cumulative-target-band-${Math.random().toString(36).slice(2, 9)}`,
    [],
  )

  return (
    <ChartContainer
      config={{
        actual: { label: `${deliverableLabel} actual`, color: actualColor },
        target: { label: "Target", color: targetColor },
      }}
      className="h-[320px] w-full"
      ref={chartRef}
    >
      <LineChart data={merged} height={320} margin={{ left: 12, right: 12, top: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={targetColor} stopOpacity={0.22} />
            <stop offset="95%" stopColor={targetColor} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid {...PACING_CARTESIAN_GRID_PROPS} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={16}
          angle={merged.length > 10 ? -45 : 0}
          textAnchor={merged.length > 10 ? "end" : "middle"}
          height={merged.length > 10 ? 56 : 30}
          tickFormatter={(v) => formatChartDateLabel(String(v))}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          tickFormatter={(v) => formatCompactNumber(Number(v))}
        />
        <ChartLegend content={<ChartLegendContent className="text-xs text-muted-foreground" />} />
        <Area
          type="monotone"
          dataKey="targetHigh"
          stroke="none"
          fill={`url(#${gradientId})`}
          name="Target range"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="targetLow"
          stroke="none"
          fill="hsl(var(--background))"
          fillOpacity={1}
          legendType="none"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="target"
          name="Target"
          stroke={targetColor}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="actual"
          name={`${deliverableLabel} actual`}
          stroke={actualColor}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, stroke: actualColor, strokeWidth: 1.25, fill: "#fff" }}
        />
        {showTodayLine ? (
          <ReferenceLine x={refLineISO} {...PACING_TODAY_REFERENCE_LINE_PROPS} />
        ) : null}
        <Tooltip />
      </LineChart>
    </ChartContainer>
  )
}
