import { StackedColumnChart } from '@/components/charts/StackedColumnChart'
import { getMonthlySpendData } from '@/lib/api/dashboard'
import { getSeriesColours } from '@/lib/charts/palette'

interface MonthlySpendChartProps {
  slug: string
  brandColour?: string
}

export default async function MonthlySpendChart({
  slug,
  brandColour,
}: MonthlySpendChartProps) {
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
      colors={getSeriesColours(brandColour)}
      cardClassName="rounded-3xl border-muted/70 bg-background/90 shadow-sm"
      headerClassName="border-b border-muted/40 px-6 py-4"
      contentClassName="p-6"
    />
  )
}


