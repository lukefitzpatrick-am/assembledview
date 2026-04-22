"use client"

import { useMemo, useState } from "react"

import MonthlySpendChart from "@/components/charts/domain/MonthlySpendChart"
import SpendByCampaignChart from "@/components/charts/domain/SpendByCampaignChart"
import SpendByMediaTypeChart from "@/components/charts/domain/SpendByMediaTypeChart"
import { cn } from "@/lib/utils"

export type MonthlySpendData = {
  month: string
  data: Array<{
    mediaType: string
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

type SpendingPeriod = "month" | "last-month" | "quarter" | "ytd"

interface SpendingInsightsSectionProps {
  monthlyData: MonthlySpendData[]
  campaignData: SpendByCampaignData[]
  mediaTypeData: SpendByMediaTypeData[]
  brandColour?: string
  defaultPeriod?: "month" | "quarter" | "ytd"
  onPeriodChange?: (period: string) => void
}

const periodOptions: Array<{ value: SpendingPeriod; label: string }> = [
  { value: "month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "ytd", label: "YTD" },
]

const periodLabelMap: Record<SpendingPeriod, string> = {
  month: "This Month",
  "last-month": "Last Month",
  quarter: "This Quarter",
  ytd: "YTD",
}

export function SpendingInsightsSection({
  monthlyData,
  campaignData,
  mediaTypeData,
  brandColour,
  defaultPeriod = "month",
  onPeriodChange,
}: SpendingInsightsSectionProps) {
  const [period, setPeriod] = useState<SpendingPeriod>(defaultPeriod)

  const hasAnyData = monthlyData.length > 0 || campaignData.length > 0 || mediaTypeData.length > 0

  const displayPeriodLabel = useMemo(() => periodLabelMap[period], [period])

  const handlePeriodChange = (next: SpendingPeriod) => {
    setPeriod(next)
    onPeriodChange?.(next)
  }

  return (
    <section className="w-full space-y-4 lg:space-y-6 xl:space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3 md:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Spending insights</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{displayPeriodLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor="spending-period-selector">
            Select spending period
          </label>
          <select
            id="spending-period-selector"
            value={period}
            onChange={(event) => handlePeriodChange(event.target.value as SpendingPeriod)}
            className={cn(
              "h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            )}
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <a href="#" className="text-sm text-primary hover:underline">
            View breakdown →
          </a>
        </div>
      </header>

      <div className="flex w-full flex-col gap-4 lg:gap-6">
        {/* Row 1: monthly spend by media type — full width */}
        <div className="w-full min-w-0">
          <div className="rounded-xl border border-border bg-card p-4 lg:p-5 xl:p-6">
            {hasAnyData ? (
              <MonthlySpendChart data={monthlyData} brandColour={brandColour} embedded />
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">No monthly spend data available.</div>
            )}
          </div>
        </div>

        {/* Row 2: pie charts — two columns from md */}
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
          <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 lg:px-5 lg:py-3.5 xl:px-6">
              <h3 className="text-sm font-medium text-foreground">Spend by Campaign</h3>
            </div>
            <div className="p-4 lg:p-5 xl:p-6">
              {campaignData.length > 0 ? (
                <SpendByCampaignChart data={campaignData} brandColour={brandColour} embedded />
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">No campaign spend data available.</div>
              )}
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3 lg:px-5 lg:py-3.5 xl:px-6">
              <h3 className="text-sm font-medium text-foreground">Spend by Media Type</h3>
            </div>
            <div className="p-4 lg:p-5 xl:p-6">
              {mediaTypeData.length > 0 ? (
                <SpendByMediaTypeChart data={mediaTypeData} brandColour={brandColour} embedded />
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">No media type spend data available.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

