"use client"

import { useCallback, useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, Legend } from "recharts"

import { useUnifiedTooltip } from "@/components/charts/UnifiedTooltip"
import { getMediaColor, getMediaLabel } from "@/lib/charts/registry"

interface MonthlySpendStackedChartProps {
  data: Array<{
    month: string
    data: Array<{
      mediaType: string
      amount: number
    }>
  }>
  /** ResponsiveContainer height in px */
  chartHeight?: number
  /** Hide the read-only helper line under the chart */
  hideFooterNote?: boolean
}

export default function MonthlySpendStackedChart({
  data,
  chartHeight = 300,
  hideFooterNote = false,
}: MonthlySpendStackedChartProps) {
  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }, [])

  const renderTooltip = useUnifiedTooltip(
    useMemo(
      () => ({
        formatValue: formatCurrency,
        showPercentages: false,
      }),
      [formatCurrency],
    ),
  )

  const { chartData, allMediaTypesArray } = useMemo(() => {
    if (!data?.length) {
      return { chartData: [] as Record<string, string | number>[], allMediaTypesArray: [] as string[] }
    }
    const allMediaTypes = new Set<string>()
    data.forEach((month) => {
      month.data.forEach((item) => {
        allMediaTypes.add(item.mediaType)
      })
    })
    const rows = data.map((month) => {
      const monthData: Record<string, string | number> = { month: month.month }
      allMediaTypes.forEach((mediaType) => {
        const item = month.data.find((d) => d.mediaType === mediaType)
        monthData[mediaType] = item ? item.amount : 0
      })
      return monthData
    })
    return { chartData: rows, allMediaTypesArray: Array.from(allMediaTypes) }
  }, [data])

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 text-muted-foreground">
        No monthly spend data available
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(value) => formatCurrency(value)} />
          <Tooltip content={renderTooltip} wrapperStyle={{ cursor: "default" }} />
          <Legend wrapperStyle={{ cursor: "default" }} />
          {allMediaTypesArray.map((mediaType) => (
            <Bar
              key={mediaType}
              dataKey={mediaType}
              stackId="a"
              fill={getMediaColor(mediaType)}
              name={getMediaLabel(mediaType)}
              cursor="default"
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {!hideFooterNote ? (
        <p className="text-xs text-muted-foreground">Read-only chart: hover bars and legend for details.</p>
      ) : null}
    </div>
  )
}
