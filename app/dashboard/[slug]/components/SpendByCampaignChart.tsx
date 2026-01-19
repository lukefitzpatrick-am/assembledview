import { PieChart } from '@/components/charts/PieChart'
import { getSpendByCampaignData } from '@/lib/api/dashboard'
import { getSeriesColours } from '@/lib/charts/palette'

interface SpendByCampaignChartProps {
  slug: string
  brandColour?: string
}

export default async function SpendByCampaignChart({
  slug,
  brandColour,
}: SpendByCampaignChartProps) {
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
      colors={getSeriesColours(brandColour)}
      cardClassName="rounded-3xl border-muted/70 bg-background/90 shadow-sm"
      headerClassName="border-b border-muted/40 px-6 py-4"
      contentClassName="p-6"
    />
  )
}


