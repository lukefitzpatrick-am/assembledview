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
      data={data.map(month => ({
        month: month.month,
        ...month.data.reduce((acc, item) => {
          acc[item.mediaType] = item.amount
          return acc
        }, {} as Record<string, number>)
      }))}
    />
  )
}


