import { PieChart } from '@/components/charts/PieChart'

interface SpendByMediaTypeChartProps {
  data: Array<{
    mediaType: string
    amount: number
    percentage: number
  }>
  brandColour?: string
  /** Omit outer card chrome when nested inside `Panel`. */
  embedded?: boolean
}

export default function SpendByMediaTypeChart({
  data,
  brandColour: _brandColour,
  embedded = false,
}: SpendByMediaTypeChartProps) {
  const chartData = data.map((item) => ({
    name: item.mediaType,
    value: item.amount,
    percentage: item.percentage,
  }))

  return (
    <PieChart
      title="Spend by Media Type"
      description="Distribution of spending across media types"
      data={chartData}
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


