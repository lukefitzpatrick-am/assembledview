"use client"

import { useMemo } from "react"

import {
  BaseChartCard,
  DonutChart,
  ShareBreakdownLegend,
  StackedBarChart,
} from "@/components/charts/system"
import { EmptyState } from "@/components/ui/states"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { DASHBOARD_CHART_PLOT_HEIGHT } from "@/lib/charts/theme"
import { getMediaLabel } from "@/lib/charts/registry"
import { channelColorFor, fmt as chartFmt } from "@/lib/chart-theme"
import {
  MEDIA_MIX_DONUT_BASIS_CAPTION,
  channelTotalsFromDeliverySchedule,
  isNonMediaMixSlice,
  mediaMixTotalFromDeliverySchedule,
  monthlyMixFromDeliverySchedule,
} from "@/lib/dashboard/mediaMixFromDeliverySchedule"
import { formatMoneyCompact } from "@/lib/format/money"

type ChannelSpend = {
  mediaType: string
  amount: number
}

type MonthlySpendEntry = {
  month: string
  data: Array<{ mediaType: string; amount: number }>
}

type SpendChartsRowProps = {
  spendByChannel: Record<string, number> | ChannelSpend[]
  monthlySpendByChannel: Record<string, Record<string, number>> | MonthlySpendEntry[]
  deliverySchedule?: any[]
  brandColour?: string
}

const CHART_PLOT_HEIGHT = DASHBOARD_CHART_PLOT_HEIGHT
const CHART_EMPTY_CLASS = "h-[400px] w-full"

const monthNames = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]

function parseMonthYearLabel(value: any): Date | null {
  if (!value || typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null

  // yyyy-mm or yyyy/mm
  if (/^\d{4}[-/]\d{2}$/.test(trimmed)) {
    const [y, m] = trimmed.split(/[-/]/)
    const year = Number(y)
    const monthIdx = Number(m) - 1
    if (!Number.isNaN(year) && monthIdx >= 0 && monthIdx <= 11) {
      return new Date(Date.UTC(year, monthIdx, 1))
    }
  }

  // yyyymm
  if (/^\d{6}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4))
    const monthIdx = Number(trimmed.slice(4, 6)) - 1
    if (!Number.isNaN(year) && monthIdx >= 0 && monthIdx <= 11) {
      return new Date(Date.UTC(year, monthIdx, 1))
    }
  }

  // December 2025 / Dec 2025
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    const maybeMonth = parts[0].toLowerCase()
    const maybeYear = Number(parts[1])
    const monthIdx = monthNames.findIndex((m) => m.startsWith(maybeMonth))
    if (!Number.isNaN(maybeYear) && monthIdx >= 0) {
      return new Date(Date.UTC(maybeYear, monthIdx, 1))
    }
  }

  const asDate = new Date(trimmed)
  return isNaN(asDate.getTime()) ? null : asDate
}

type MonthlySpendByChannel = {
  month: string
  [channel: string]: string | number
}

export default function SpendChartsRow({
  spendByChannel,
  monthlySpendByChannel,
  deliverySchedule,
}: SpendChartsRowProps) {
  /** Authoritative path: same delivery-schedule parser as Expected Spend (AV-16). */
  const derivedFromDelivery = useMemo(() => {
    if (deliverySchedule == null) return null
    const channelData = channelTotalsFromDeliverySchedule(deliverySchedule)
    if (channelData.length === 0) return null
    return {
      channelData,
      monthlyData: monthlyMixFromDeliverySchedule(deliverySchedule),
      mixTotal: mediaMixTotalFromDeliverySchedule(deliverySchedule),
    }
  }, [deliverySchedule])

  const channelData = useMemo(() => {
    if (derivedFromDelivery?.channelData?.length) return derivedFromDelivery.channelData
    if (Array.isArray(spendByChannel)) {
      return spendByChannel.map((entry, idx) => ({
        channel: entry.mediaType || `Channel ${idx + 1}`,
        spend: entry.amount ?? 0,
      }))
    }
    return Object.entries(spendByChannel || {}).map(([channel, spend]) => ({ channel, spend: Number(spend) || 0 }))
  }, [derivedFromDelivery, spendByChannel])

  const monthlyData = useMemo(() => {
    if (derivedFromDelivery?.monthlyData?.length) return derivedFromDelivery.monthlyData
    if (Array.isArray(monthlySpendByChannel)) {
      return monthlySpendByChannel.map((entry) => {
        const row: MonthlySpendByChannel = {
          month: entry.month,
        }
        entry.data.forEach((d) => {
          row[d.mediaType] = d.amount ?? 0
        })
        return row
      })
    }
    return Object.entries(monthlySpendByChannel || {}).map(([month, mediaSpend]) => {
      const row: MonthlySpendByChannel = {
        month,
      }
      Object.entries(mediaSpend || {}).forEach(([mediaType, amount]) => {
        row[mediaType] = Number(amount) || 0
      })
      return row
    })
  }, [derivedFromDelivery, monthlySpendByChannel])

  const asAtDate = useMemo(() => {
    const source = monthlyData[monthlyData.length - 1]?.month
    if (!source) return "—"
    return String(source)
  }, [monthlyData])

  const dateRangeLabel = useMemo(() => {
    const months = monthlyData.map((m) => parseMonthYearLabel(String(m.month))).filter(Boolean) as Date[]
    if (!months.length) return undefined
    const sorted = months.sort((a, b) => a.getTime() - b.getTime())
    const fmt = (d: Date) => d.toLocaleDateString("en-AU", { month: "short", year: "numeric" })
    return `${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1])}`
  }, [monthlyData])

  const mediaChannelPieData = useMemo(
    () =>
      channelData
        .filter((c) => !isNonMediaMixSlice(c.channel))
        .map((c) => ({
          mediaType: c.channel,
          amount: Number(c.spend) || 0,
        })),
    [channelData],
  )

  const monthlySpendStackedInput = useMemo(
    () =>
      monthlyData.map((row) => ({
        month: String(row.month),
        data: Object.entries(row)
          .filter(([k]) => k !== "month" && !isNonMediaMixSlice(k))
          .map(([mediaType, amount]) => ({
            mediaType,
            amount: Number(amount) || 0,
          })),
      })),
    [monthlyData],
  )

  const pivotedMonthly = useMemo(
    () =>
      monthlySpendStackedInput.map((m) => {
        const row: Record<string, number | string> = { month: m.month }
        for (const { mediaType, amount } of m.data) {
          row[mediaType] = amount
        }
        return row
      }),
    [monthlySpendStackedInput],
  )

  const monthlySeries = useMemo(() => {
    const orderedKeys: string[] = []
    const seen = new Set<string>()
    for (const m of monthlySpendStackedInput) {
      for (const { mediaType } of m.data) {
        if (!seen.has(mediaType)) {
          seen.add(mediaType)
          orderedKeys.push(mediaType)
        }
      }
    }
    return orderedKeys.map((key, i) => ({
      key,
      label: getMediaLabel(key),
      color: channelColorFor(key, i),
    }))
  }, [monthlySpendStackedInput])

  const mediaChannelDonutData = useMemo(
    () =>
      mediaChannelPieData
        .filter((d) => d.amount > 0)
        .map((d, i) => ({
          label: getMediaLabel(d.mediaType),
          value: d.amount,
          color: channelColorFor(d.mediaType, i),
        })),
    [mediaChannelPieData],
  )

  const mediaChannelTotal = useMemo(
    () => mediaChannelDonutData.reduce((s, r) => s + r.value, 0),
    [mediaChannelDonutData],
  )

  if (!channelData.length && !monthlyData.length) {
    return (
      <Panel className="border-border/60 bg-card shadow-none">
        <PanelHeader className="p-4">
          <PanelTitle className="text-base">The plan</PanelTitle>
        </PanelHeader>
        <PanelContent standalone>
          <EmptyState
            className="border-0 bg-transparent"
            title="No planned media data available for this period"
            message="Try adjusting your selected date range and refresh."
          />
        </PanelContent>
      </Panel>
    )
  }

  return (
    <section className="w-full space-y-4 rounded-2xl border border-border/60 bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">The plan</h3>
          <p className="text-sm text-muted-foreground">
            {`Planned media by channel and month · ${formatMoneyCompact(mediaChannelTotal)} gross media, excludes fees`}
          </p>
        </div>
        {dateRangeLabel ? (
          <span className="inline-flex rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            {dateRangeLabel}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
        <BaseChartCard
          title="Planned media by type"
          subtitle={`${MEDIA_MIX_DONUT_BASIS_CAPTION} · excludes fees · Total: ${chartFmt.currencyCompact(mediaChannelTotal)}`}
          exportPage="dashboard"
          exportSeries={{
            data: mediaChannelDonutData,
            xKey: "label",
            seriesKeys: ["value"],
          }}
        >
          {mediaChannelTotal > 0 ? (
            <>
              <DonutChart
                data={mediaChannelDonutData}
                centerValue={chartFmt.currencyCompact(mediaChannelTotal)}
                centerLabel="Total"
                valueFormat="dollars"
                plotHeight={CHART_PLOT_HEIGHT}
                className="w-full"
              />
              <ShareBreakdownLegend
                items={mediaChannelDonutData}
                total={mediaChannelTotal}
                valueFormat="dollars"
              />
            </>
          ) : (
            <EmptyState
              className={`${CHART_EMPTY_CLASS} border-0 bg-transparent`}
              title="No planned media for this period"
              message={null}
            />
          )}
        </BaseChartCard>

        <BaseChartCard
          title="Planned media by month"
          subtitle={`gross media by month, planned · excludes fees · As at ${asAtDate}`}
          exportPage="dashboard"
          exportSeries={{
            data: pivotedMonthly,
            xKey: "month",
            seriesKeys: monthlySeries.map((s) => s.key),
          }}
        >
          <StackedBarChart
            data={pivotedMonthly}
            xKey="month"
            series={monthlySeries}
            valueFormat="dollars"
            plotHeight={CHART_PLOT_HEIGHT}
            className="w-full"
          />
        </BaseChartCard>
      </div>
    </section>
  )
}
