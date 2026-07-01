"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import {
  DonutChart,
  StackedBarChart,
  ToggleableLegend,
} from "@/components/charts/system"
import { SpendingInsightChartShell } from "@/components/dashboard/SpendingInsightChartShell"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/states"
import { buildDonutSlices } from "@/lib/charts-app/donutSlices"
import { getDeterministicColor, getMediaLabel } from "@/lib/charts/registry"
import { channelColorFor, fmt } from "@/lib/chart-theme"
import { formatCurrencyAUD } from "@/lib/format/currency"

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

type MonthlyStackedEntry = {
  month: string
  data: Array<{
    key?: string
    mediaType?: string
    campaignName?: string
    amount: number
  }>
}

type MonthlyView = "mediaType" | "campaign"

interface SpendingInsightsSectionProps {
  monthlyData: MonthlySpendData[]
  monthlySpendByCampaign: MonthlySpendByCampaignData[]
  campaignData: SpendByCampaignData[]
  mediaTypeData: SpendByMediaTypeData[]
  brandColour?: string
}

function resolveEntryKey(item: MonthlyStackedEntry["data"][number]): string {
  return item.key ?? item.mediaType ?? item.campaignName ?? "Unspecified"
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
      const key = resolveEntryKey(item)
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

const CHART_HEIGHT = "min-h-[320px] w-full"

export function SpendingInsightsSection({
  monthlyData,
  monthlySpendByCampaign,
  campaignData,
  mediaTypeData,
  brandColour: _brandColour,
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

  const pivotedMonthly = useMemo(
    () =>
      activeMonthlyStacked.map((month) => ({
        month: month.month,
        ...month.data.reduce(
          (acc, item) => {
            const key = resolveEntryKey(item)
            acc[key] = (acc[key] || 0) + item.amount
            return acc
          },
          {} as Record<string, number>,
        ),
      })),
    [activeMonthlyStacked],
  )

  const monthlySeries = useMemo(() => {
    const keys = new Set<string>()
    for (const row of pivotedMonthly) {
      for (const k of Object.keys(row)) {
        if (k !== "month") keys.add(k)
      }
    }
    return Array.from(keys)
      .sort()
      .map((key, i) => ({
        key,
        label: getSeriesLabel(key),
        color:
          monthlyView === "mediaType"
            ? channelColorFor(key, i)
            : getDeterministicColor(key),
      }))
  }, [getSeriesLabel, monthlyView, pivotedMonthly])

  const visibleMonthlySeries = useMemo(
    () => monthlySeries.filter((s) => !hiddenKeys.has(s.key)),
    [hiddenKeys, monthlySeries],
  )

  const monthlyBarData = useMemo(
    () =>
      pivotedMonthly.map((row) => {
        const next: Record<string, number | string> = { month: row.month }
        for (const s of visibleMonthlySeries) {
          next[s.key] = Number(row[s.key]) || 0
        }
        return next
      }),
    [pivotedMonthly, visibleMonthlySeries],
  )

  const monthlyLegendItems = useMemo(
    () =>
      monthlySeries.map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color ?? channelColorFor(s.key),
      })),
    [monthlySeries],
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

  const { slices: campaignDonutSlices, total: campaignTotal } = useMemo(
    () => buildDonutSlices(campaignDonutMapped, 8, 7),
    [campaignDonutMapped],
  )

  const { slices: mediaDonutSlices, total: mediaTotal } = useMemo(
    () => buildDonutSlices(mediaDonutMapped, 8, 7, getMediaLabel),
    [mediaDonutMapped],
  )

  const campaignDonutData = useMemo(
    () =>
      campaignDonutSlices.map((slice) => ({
        label: slice.label,
        value: slice.value,
        color: getDeterministicColor(slice.key),
      })),
    [campaignDonutSlices],
  )

  const mediaDonutData = useMemo(
    () =>
      mediaDonutSlices.map((slice, i) => ({
        label: getMediaLabel(slice.key),
        value: slice.value,
        color: channelColorFor(slice.key, i),
      })),
    [mediaDonutSlices],
  )

  const campaignCsvRows = useMemo(
    () =>
      campaignDonutSlices.map((slice) => ({
        Name: slice.label,
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

  const toggleLegendKey = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
            <div className="space-y-3">
              <ToggleableLegend
                items={monthlyLegendItems}
                hidden={hiddenKeys}
                onToggle={toggleLegendKey}
              />
              <StackedBarChart
                data={monthlyBarData}
                xKey="month"
                series={visibleMonthlySeries}
                valueFormat="dollars"
                className={CHART_HEIGHT}
              />
            </div>
          ) : (
            <EmptyState
              className="min-h-80 border-0 bg-transparent"
              title="No monthly spend data available"
              message={null}
            />
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
            {campaignData.length > 0 && campaignTotal > 0 ? (
              <DonutChart
                data={campaignDonutData}
                centerValue={fmt.currencyCompact(campaignTotal)}
                centerLabel="Total"
                valueFormat="dollars"
                className="min-h-[280px] w-full"
              />
            ) : (
              <EmptyState
                className="min-h-72 border-0 bg-transparent"
                title="No campaign spend data available"
                message={null}
              />
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
            {mediaTypeData.length > 0 && mediaTotal > 0 ? (
              <DonutChart
                data={mediaDonutData}
                centerValue={fmt.currencyCompact(mediaTotal)}
                centerLabel="Total"
                valueFormat="dollars"
                className="min-h-[280px] w-full"
              />
            ) : (
              <EmptyState
                className="min-h-72 border-0 bg-transparent"
                title="No media type spend data available"
                message={null}
              />
            )}
          </SpendingInsightChartShell>
        </div>
      </div>
    </section>
  )
}
