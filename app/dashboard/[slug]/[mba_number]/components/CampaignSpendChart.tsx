"use client"

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Legend, Tooltip } from 'recharts'

interface CampaignSpendChartProps {
  expectedSpend: number
  campaignBudget: number
}

export default function CampaignSpendChart({ expectedSpend, campaignBudget }: CampaignSpendChartProps) {
  // Calculate percentage of budget spent
  const spendPercentage = campaignBudget > 0 ? (expectedSpend / campaignBudget) * 100 : 0
  
  const data = [
    {
      name: 'Budget Utilization',
      expected: Math.min(100, Math.max(0, spendPercentage)),
      max: 100
    }
  ]

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const getColor = (value: number) => {
    if (value >= 100) return '#ef4444' // red
    if (value >= 75) return '#f59e0b' // amber
    if (value >= 50) return '#3b82f6' // blue
    return '#10b981' // green
  }

  return (
    <div className="w-full">
      <div className="mb-4 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Expected Spend</span>
          <span className="text-lg font-bold">{formatCurrency(expectedSpend)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Campaign Budget</span>
          <span className="text-lg font-bold">{formatCurrency(campaignBudget)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Utilization</span>
          <span className="text-lg font-bold">{spendPercentage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-6 relative overflow-hidden">
          <div
            className="h-full transition-all duration-300 rounded-full"
            style={{
              width: `${Math.min(100, Math.max(0, spendPercentage))}%`,
              backgroundColor: getColor(spendPercentage)
            }}
          />
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip 
            formatter={(value: number) => `${value.toFixed(1)}%`}
            contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc', borderRadius: '4px' }}
          />
          <Bar dataKey="expected" fill={getColor(spendPercentage)} radius={[0, 4, 4, 0]}>
            <Cell fill={getColor(spendPercentage)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
