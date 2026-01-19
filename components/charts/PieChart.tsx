'use client'

import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

interface PieChartData {
  name: string
  value: number
  percentage: number
}

interface PieChartProps {
  title: string
  description: string
  data: PieChartData[]
  colors?: string[]
  onExport?: () => void
  cardClassName?: string
  headerClassName?: string
  contentClassName?: string
}

const DEFAULT_COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00',
  '#ff00ff', '#00ffff', '#ff0000', '#0000ff', '#ffff00'
]

export function PieChart({
  title,
  description,
  data,
  colors = DEFAULT_COLORS,
  onExport,
  cardClassName,
  headerClassName,
  contentClassName,
}: PieChartProps) {
  const totalValue = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0)

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const entry = payload[0]
      const value = Number(entry?.value) || 0
      const pct =
        typeof entry?.payload?.percentage === "number"
          ? entry.payload.percentage
          : totalValue > 0
            ? (value / totalValue) * 100
            : 0

      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="font-semibold">{entry?.name}</p>
          <p className="text-blue-600">{formatCurrency(value)}</p>
          <p className="text-sm text-gray-500">{pct.toFixed(1)}%</p>
          <p className="mt-2 border-t pt-2 text-sm font-semibold">Total: {formatCurrency(totalValue)}</p>
        </div>
      )
    }
    return null
  }

  const handleExport = () => {
    if (onExport) {
      onExport()
    } else {
      // Default CSV export
      const csvContent = [
        'Name,Value,Percentage',
        ...data.map(item => `${item.name},${item.value},${item.percentage.toFixed(2)}%`)
      ].join('\n')
      
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    }
  }

  return (
    <Card className={cn(cardClassName)}>
      <CardHeader className={cn(headerClassName)}>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className={cn(contentClassName)}>
        <div className="h-[512px]">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percentage, value }) => {
                  const formattedValue = new Intl.NumberFormat("en-AU", {
                    style: "currency",
                    currency: "AUD",
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  }).format(value)
                  return `${name} (${percentage.toFixed(1)}%, ${formattedValue})`
                }}
                outerRadius={150}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

