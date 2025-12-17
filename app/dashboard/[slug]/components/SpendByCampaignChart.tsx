import { PieChart } from '@/components/charts/PieChart'
import { getSpendByCampaignData } from '@/lib/api/dashboard'

interface SpendByCampaignChartProps {
  slug: string
}

export default async function SpendByCampaignChart({ slug }: SpendByCampaignChartProps) {
  const data = await getSpendByCampaignData(slug)
  
  return (
    <PieChart
      title="Spend by Campaign"
      description="Distribution of spending across campaigns"
      data={data.length > 0 
        ? data.map(item => ({
            name: item.campaignName,
            value: item.amount,
            percentage: item.percentage
          }))
        : [
            { name: 'Sample Campaign 1', value: 75000, percentage: 50 },
            { name: 'Sample Campaign 2', value: 45000, percentage: 30 },
            { name: 'Sample Campaign 3', value: 30000, percentage: 20 }
          ]
      }
    />
  )
}


