import { StackedColumnChart } from '@/components/charts/StackedColumnChart'
import { getMonthlySpendData } from '@/lib/api/dashboard'

interface MonthlySpendChartProps {
  slug: string
}

export default async function MonthlySpendChart({ slug }: MonthlySpendChartProps) {
  const data = await getMonthlySpendData(slug)
  
  return (
    <StackedColumnChart
      title="Spend by Media Type by Month"
      description="Monthly spending trends for the current year"
      data={data.length > 0 
        ? data.map(month => ({
            month: month.month,
            ...month.data.reduce((acc, item) => {
              acc[item.mediaType] = item.amount
              return acc
            }, {} as Record<string, number>)
          }))
        : [
            { month: 'Jan', 'Television': 50000, 'Digital Video': 30000, 'Social Media': 25000 },
            { month: 'Feb', 'Television': 45000, 'Digital Video': 35000, 'Social Media': 20000 },
            { month: 'Mar', 'Television': 55000, 'Digital Video': 40000, 'Social Media': 30000 },
            { month: 'Apr', 'Television': 60000, 'Digital Video': 45000, 'Social Media': 35000 },
            { month: 'May', 'Television': 65000, 'Digital Video': 50000, 'Social Media': 40000 },
            { month: 'Jun', 'Television': 70000, 'Digital Video': 55000, 'Social Media': 45000 }
          ]
      }
    />
  )
}


