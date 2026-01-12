'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

interface StackedColumnData {
  month: string
  [key: string]: string | number
}

interface StackedColumnChartProps {
  title: string
  description: string
  data: StackedColumnData[]
  colors?: string[]
  onExport?: () => void
}

const DEFAULT_COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00',
  '#ff00ff', '#00ffff', '#ff0000', '#0000ff', '#ffff00'
]

const formatCurrencyNoDecimals = (value: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)

export function StackedColumnChart({ title, description, data, colors = DEFAULT_COLORS, onExport }: StackedColumnChartProps) {
  // Extract all media types across all rows (not just the first) to avoid empty charts when the first month has no data
  const mediaTypes = Array.from(
    new Set(
      data.flatMap(row => Object.keys(row).filter(key => key !== 'month'))
    )
  )
  
  const handleExport = () => {
    if (onExport) {
      onExport()
    } else {
      // Default CSV export
      const csvContent = [
        'Month,' + mediaTypes.join(','),
        ...data.map(row => 
          row.month + ',' + mediaTypes.map(type => row[type] || 0).join(',')
        )
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
    <Card>
      <CardHeader>
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
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={formatCurrencyNoDecimals} tick={{ fontSize: 11 }} />
              <Tooltip 
                formatter={(value: number, name: string) => [formatCurrencyNoDecimals(value), name]}
                labelFormatter={(label) => `Month: ${label}`}
              />
              <Legend />
              {mediaTypes.map((mediaType, index) => (
                <Bar 
                  key={mediaType}
                  dataKey={mediaType} 
                  stackId="a" 
                  fill={colors[index % colors.length]}
                  name={mediaType}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

