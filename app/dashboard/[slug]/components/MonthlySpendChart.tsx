import { StackedColumnChart } from '@/components/charts/StackedColumnChart'

interface MonthlySpendChartProps {
  data: Array<{
    month: string
    data: Array<{
      mediaType: string
      amount: number
    }>
  }>
  brandColour?: string
  /** Omit outer card chrome when nested inside `Panel`. */
  embedded?: boolean
}

export default function MonthlySpendChart({
  data,
  brandColour: _brandColour,
  embedded = false,
}: MonthlySpendChartProps) {
  const chartData = data.map((month) => ({
    month: month.month,
    ...month.data.reduce(
      (acc, item) => {
        acc[item.mediaType] = item.amount
        return acc
      },
      {} as Record<string, number>
    ),
  }))
  return (
    <StackedColumnChart
      title="Spend by Media Type by Month"
      description="Monthly spending trends for the current year"
      data={chartData}
      cardClassName={
        embedded
          ? "rounded-none border-0 bg-transparent shadow-none"
          : "rounded-3xl border-muted/70 bg-background/90 shadow-sm"
      }
      headerClassName="border-b border-muted/40 px-4 py-3 sm:px-6 sm:py-4 lg:px-6 lg:py-4"
      contentClassName="p-4 sm:p-6 lg:p-6"
      chartAreaClassName={
        embedded
          ? "h-[300px] lg:h-[360px] xl:h-[400px]"
          : undefined
      }
    />
  )
}


