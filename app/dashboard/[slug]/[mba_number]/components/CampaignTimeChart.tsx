"use client"

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts'

interface CampaignTimeChartProps {
  timeElapsed: number
  startDate?: string
  endDate?: string
}

export default function CampaignTimeChart({ timeElapsed }: CampaignTimeChartProps) {
  const data = [
    {
      name: 'Time Elapsed',
      value: Math.min(100, Math.max(0, timeElapsed)),
      max: 100
    }
  ]

  const getColor = (value: number) => {
    if (value >= 100) return '#ef4444' // red
    if (value >= 75) return '#f59e0b' // amber
    if (value >= 50) return '#3b82f6' // blue
    return '#10b981' // green
  }

  return (
    <div className="w-full">
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">Progress</span>
          <span className="text-lg font-bold">{timeElapsed.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-6 relative overflow-hidden">
          <div
            className="h-full transition-all duration-300 rounded-full"
            style={{
              width: `${Math.min(100, Math.max(0, timeElapsed))}%`,
              backgroundColor: getColor(timeElapsed)
            }}
          />
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis type="category" dataKey="name" hide />
          <Bar dataKey="value" fill={getColor(timeElapsed)} radius={[0, 4, 4, 0]}>
            <Cell fill={getColor(timeElapsed)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
