import { PieChart } from '@/components/charts/PieChart'

interface SpendByCampaignChartProps {
  data: Array<{
    campaignName: string
    mbaNumber: string
    amount: number
    percentage: number
  }>
  brandColour?: string
  /** Omit outer card chrome when nested inside `Panel`. */
  embedded?: boolean
}

export default function SpendByCampaignChart({
  data,
  brandColour: _brandColour,
  embedded = false,
}: SpendByCampaignChartProps) {
  return (
    <PieChart
      title="Spend by Campaign"
      description="Distribution of spending across campaigns"
      data={data.map((item) => ({
        name: item.campaignName,
        value: item.amount,
        percentage: item.percentage,
      }))}
      cardClassName={
        embedded
          ? "rounded-none border-0 bg-transparent shadow-none"
          : "rounded-3xl border-muted/70 bg-background/90 shadow-sm"
      }
      headerClassName="border-b border-muted/40 px-4 py-3 sm:px-6 sm:py-4"
      contentClassName="p-4 sm:p-6"
      plotAreaClassName={
        embedded
          ? "h-[300px] sm:h-[320px] md:h-[360px] lg:h-[380px] xl:h-[400px]"
          : undefined
      }
    />
  )
}


