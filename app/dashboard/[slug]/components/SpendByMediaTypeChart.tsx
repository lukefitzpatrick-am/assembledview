import { PieChart } from '@/components/charts/PieChart'
import { getSpendByMediaTypeData } from '@/lib/api/dashboard'
import { getSeriesColours } from '@/lib/charts/palette'

interface SpendByMediaTypeChartProps {
  slug: string
  brandColour?: string
}

export default async function SpendByMediaTypeChart({
  slug,
  brandColour,
}: SpendByMediaTypeChartProps) {
  const data = await getSpendByMediaTypeData(slug)
  
  return (
    <PieChart
      title="Spend by Media Type"
      description="Distribution of spending across media types"
      data={data.map(item => ({
        name: item.mediaType,
        value: item.amount,
        percentage: item.percentage
      }))}
      colors={getSeriesColours(brandColour)}
      cardClassName="rounded-3xl border-muted/70 bg-background/90 shadow-sm"
      headerClassName="border-b border-muted/40 px-6 py-4"
      contentClassName="p-6"
    />
  )
}


