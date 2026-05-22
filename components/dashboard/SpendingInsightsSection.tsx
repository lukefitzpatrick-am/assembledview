"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { buildDonutSlices } from "@/components/charts/DonutChart"
import MonthlySpendChart, {
  type MonthlyStackedEntry,
} from "@/components/charts/domain/MonthlySpendChart"
import SpendByCampaignChart from "@/components/charts/domain/SpendByCampaignChart"
import SpendByMediaTypeChart from "@/components/charts/domain/SpendByMediaTypeChart"
import { SpendingInsightChartShell } from "@/components/dashboard/SpendingInsightChartShell"
import { Button } from "@/components/ui/button"
import { formatCurrencyAUD } from "@/lib/format/currency"
import { getMediaLabel } from "@/lib/charts/registry"

export type MonthlySpendData = {
  month: string
  data: Array<{
    mediaType: string
    amount: number
  }>
}

export type MonthlySpendByCampaignData = {
  month: string
  data: Array<{
    campaignName: string
    amount: number
  }>
}

export type SpendByCampaignData = {
  campaignName: string
  mbaNumber: string
  amount: number
  percentage: number
}

export type SpendByMediaTypeData = {
  mediaType: string
  amount: number
  percentage: number
}

type MonthlyView = "mediaType" | "campaign"

interface SpendingInsightsSectionProps {
  monthlyData: MonthlySpendData[]
  monthlySpendByCampaign: MonthlySpendByCampaignData[]
  campaignData: SpendByCampaignData[]
  mediaTypeData: SpendByMediaTypeData[]
  brandColour?: string
}

function toMediaStacked(data: MonthlySpendData[]): MonthlyStackedEntry[] {
  return data.map((month) => ({
    month: month.month,
    data: month.data.map((item) => ({ key: item.mediaType, amount: item.amount })),
  }))
}

function toCampaignStacked(data: MonthlySpendByCampaignData[]): MonthlyStackedEntry[] {
  return data.map((month) => ({
    month: month.month,
    data: month.data.map((item) => ({ key: item.campaignName, amount: item.amount })),
  }))
}

function buildMonthlyCsvRows(
  data: MonthlyStackedEntry[],
  hiddenKeys: Set<string>,
  getLabel: (key: string) => string,
): Array<{ Month: string; Category: string; Amount: string }> {
  const rows: Array<{ Month: string; Category: string; Amount: string }> = []
  for (const month of data) {
    for (const item of month.data) {
      const key = item.key ?? item.mediaType ?? item.campaignName ?? "Unspecified"
      if (hiddenKeys.has(key) || item.amount <= 0) continue
      rows.push({
        Month: month.month,
        Category: getLabel(key),
        Amount: formatCurrencyAUD(item.amount),
      })
    }
  }
  return rows
}

const MONTHLY_CSV_COLUMNS = [
  { header: "Month", accessor: "Month" as const },
  { header: "Category", accessor: "Category" as const },
  { header: "Amount", accessor: "Amount" as const },
]

const DONUT_CSV_COLUMNS = [
  { header: "Name", accessor: "Name" as const },
  { header: "Value", accessor: "Value" as const },
  { header: "Percentage", accessor: "Percentage" as const },
]

export function SpendingInsightsSection({
  monthlyData,
  monthlySpendByCampaign,
  campaignData,
  mediaTypeData,
  brandColour,
}: SpendingInsightsSectionProps) {
  const [monthlyView, setMonthlyView] = useState<MonthlyView>("mediaType")
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set())
  const monthlyChartRef = useRef<HTMLDivElement | null>(null)
  const campaignPieRef = useRef<HTMLDivElement | null>(null)
  const mediaPieRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setHiddenKeys(new Set())
  }, [monthlyView])

  const activeMonthlyStacked = useMemo(
    () =>
      monthlyView === "mediaType"
        ? toMediaStacked(monthlyData)
        : toCampaignStacked(monthlySpendByCampaign),
    [monthlyData, monthlySpendByCampaign, monthlyView],
  )

  const getSeriesLabel = useMemo(
    () => (monthlyView === "mediaType" ? getMediaLabel : (key: string) => key),
    [monthlyView],
  )

  const monthlyChartTitle =
    monthlyView === "mediaType" ? "Monthly spend by media type" : "Monthly spend by campaign"

  const monthlyCsvRows = useMemo(
    () => buildMonthlyCsvRows(activeMonthlyStacked, hiddenKeys, getSeriesLabel),
    [activeMonthlyStacked, hiddenKeys, getSeriesLabel],
  )

  const campaignDonutMapped = useMemo(
    () =>
      (campaignData ?? []).map((item) => ({
        key: item.campaignName,
        value: Number(item.amount) || 0,
      })),
    [campaignData],
  )

  const mediaDonutMapped = useMemo(
    () =>
      (mediaTypeData ?? []).map((item) => ({
        key: item.mediaType,
        value: Number(item.amount) || 0,
      })),
    [mediaTypeData],
  )

  const campaignDonutSlices = useMemo(
    () => buildDonutSlices(campaignDonutMapped, 8, 7).slices,
    [campaignDonutMapped],
  )

  const mediaDonutSlices = useMemo(
    () => buildDonutSlices(mediaDonutMapped, 8, 7).slices,
    [mediaDonutMapped],
  )

  const campaignCsvRows = useMemo(
    () =>
      campaignDonutSlices.map((slice) => ({
        Name: slice.key,
        Value: formatCurrencyAUD(slice.value),
        Percentage: `${slice.percentage.toFixed(1)}%`,
      })),
    [campaignDonutSlices],
  )

  const mediaCsvRows = useMemo(
    () =>
      mediaDonutSlices.map((slice) => ({
        Name: getMediaLabel(slice.key),
        Value: formatCurrencyAUD(slice.value),
        Percentage: `${slice.percentage.toFixed(1)}%`,
      })),
    [mediaDonutSlices],
  )

  const hasMonthlyData = activeMonthlyStacked.some((m) =>
    m.data.some((d) => d.amount > 0),
  )

  return (
    <section className="w-full space-y-4 lg:space-y-6 xl:space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3 md:gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Spending insights</h2>
          <p className="text-sm text-muted-foreground">Current financial year</p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setMonthlyView((v) => (v === "mediaType" ? "campaign" : "mediaType"))
          }
        >
          {monthlyView === "mediaType" ? "View by campaign" : "View by media type"}
        </Button>
      </header>

      <div className="flex w-full flex-col gap-4 lg:gap-6">
        <SpendingInsightChartShell
          title={monthlyChartTitle}
          description="Australian financial year (Jul–Jun)"
          chartAreaRef={monthlyChartRef}
          chartAreaClassName="min-h-[360px] w-full"
          csvRows={monthlyCsvRows}
          csvColumns={MONTHLY_CSV_COLUMNS}
          csvFilename={
            monthlyView === "mediaType"
              ? "monthly-spend-by-media-type"
              : "monthly-spend-by-campaign"
          }
        >
          {hasMonthlyData ? (
            <MonthlySpendChart
              data={activeMonthlyStacked}
              brandColour={brandColour}
              embedded
              chartHeight={320}
              getSeriesLabel={getSeriesLabel}
              legendVerticalAlign="bottom"
              hiddenKeys={hiddenKeys}
              onHiddenKeysChange={setHiddenKeys}
            />
          ) : (
            <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
              No monthly spend data available.
            </div>
          )}
        </SpendingInsightChartShell>

        <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
          <SpendingInsightChartShell
            title="Spend by Campaign"
            description="Distribution of spending across campaigns"
            chartAreaRef={campaignPieRef}
            chartAreaClassName="min-h-[360px] w-full"
            csvRows={campaignCsvRows}
            csvColumns={DONUT_CSV_COLUMNS}
            csvFilename="spend-by-campaign"
          >
            {campaignData.length > 0 ? (
              <SpendByCampaignChart data={campaignData} brandColour={brandColour} embedded height={280} />
            ) : (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                No campaign spend data available.
              </div>
            )}
          </SpendingInsightChartShell>

          <SpendingInsightChartShell
            title="Spend by Media Type"
            description="Distribution of spending across media types"
            chartAreaRef={mediaPieRef}
            chartAreaClassName="min-h-[360px] w-full"
            csvRows={mediaCsvRows}
            csvColumns={DONUT_CSV_COLUMNS}
            csvFilename="spend-by-media-type"
          >
            {mediaTypeData.length > 0 ? (
              <SpendByMediaTypeChart data={mediaTypeData} brandColour={brandColour} embedded height={280} />
            ) : (
              <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                No media type spend data available.
              </div>
            )}
          </SpendingInsightChartShell>
        </div>
      </div>
    </section>
  )
}
