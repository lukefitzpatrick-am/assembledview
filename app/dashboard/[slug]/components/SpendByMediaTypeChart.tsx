import { PieChart } from '@/components/charts/PieChart'
import { getSpendByMediaTypeData } from '@/lib/api/dashboard'

interface SpendByMediaTypeChartProps {
  slug: string
}

export default async function SpendByMediaTypeChart({ slug }: SpendByMediaTypeChartProps) {
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
    />
  )
}


