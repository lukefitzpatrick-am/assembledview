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
      data={data.length > 0 
        ? data.map(item => ({
            name: item.mediaType,
            value: item.amount,
            percentage: item.percentage
          }))
        : [
            { name: 'Television', value: 50000, percentage: 40 },
            { name: 'Digital Video', value: 30000, percentage: 24 },
            { name: 'Social Media', value: 25000, percentage: 20 },
            { name: 'Radio', value: 20000, percentage: 16 }
          ]
      }
    />
  )
}


