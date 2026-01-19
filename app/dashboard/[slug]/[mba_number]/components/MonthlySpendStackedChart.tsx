"use client"

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, Legend } from 'recharts'

interface MonthlySpendStackedChartProps {
  data: Array<{
    month: string
    data: Array<{
      mediaType: string
      amount: number
    }>
  }>
}

const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8',
  '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1', '#d084d0',
  '#ffb347', '#87ceeb', '#dda0dd', '#f0e68c', '#ff7f50',
  '#40e0d0', '#ee82ee', '#98d8c8'
]

export default function MonthlySpendStackedChart({ data }: MonthlySpendStackedChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 text-muted-foreground">
        No monthly spend data available
      </div>
    )
  }

  // Transform data for stacked bar chart
  // Get all unique media types
  const allMediaTypes = new Set<string>()
  data.forEach(month => {
    month.data.forEach(item => {
      allMediaTypes.add(item.mediaType)
    })
  })

  // Create chart data structure
  const chartData = data.map(month => {
    const monthData: any = { month: month.month }
    allMediaTypes.forEach(mediaType => {
      const item = month.data.find(d => d.mediaType === mediaType)
      monthData[mediaType] = item ? item.amount : 0
    })
    return monthData
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + (Number(entry.value) || 0), 0)
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => {
            const value = Number(entry.value) || 0
            if (value <= 0) return null
            return (
              <p key={index} style={{ color: entry.color }} className="text-sm">
                {entry.name}: {formatCurrency(value)}
              </p>
            )
          })}
          <p className="font-semibold mt-2 pt-2 border-t">
            Total: {formatCurrency(total)}
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis tickFormatter={(value) => formatCurrency(value)} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        {Array.from(allMediaTypes).map((mediaType, index) => (
          <Bar
            key={mediaType}
            dataKey={mediaType}
            stackId="a"
            fill={COLORS[index % COLORS.length]}
            name={mediaType}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
