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
      data={data.map(item => ({
        name: item.campaignName,
        value: item.amount,
        percentage: item.percentage
      }))}
    />
  )
}


