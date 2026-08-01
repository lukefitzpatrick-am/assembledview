"use client"

import { useMemo } from "react"

import {
  BaseChartCard,
  DonutChart,
  HorizontalBarChart,
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
  mediaMixTotalFromDeliverySchedule,
  monthlyMixFromDeliverySchedule,
} from "@/lib/dashboard/mediaMixFromDeliverySchedule"
import { formatMoneyCompact } from "@/lib/format/money"
import { normaliseLineItemsByType, type NormalisedLineItem } from "@/lib/mediaplan/normalizeLineItem"

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
  /** Line items by media type — used for spend-by-publisher chart */
  lineItemsMap?: Record<string, NormalisedLineItem[] | any[]>
  /** Prorated planned media to date (matches campaign summary Expected Spend) */
  campaignSpendToDate?: number
}

const CHART_PLOT_HEIGHT = DASHBOARD_CHART_PLOT_HEIGHT
const CHART_EMPTY_CLASS = "h-[400px] w-full"

const UNKNOWN_PUBLISHER = "Unknown"
const OTHER_BUCKET = "Other"
const MAX_PUBLISHERS = 10
const TOP_N_BEFORE_OTHER = 9

function burstGross(burst: { budget?: number; deliverablesAmount?: number }): number {
  const fromDeliverables =
    typeof burst.deliverablesAmount === "number" && Number.isFinite(burst.deliverablesAmount)
      ? burst.deliverablesAmount
      : 0
  const fromBudget = typeof burst.budget === "number" && Number.isFinite(burst.budget) ? burst.budget : 0
  return fromDeliverables > 0 ? fromDeliverables : fromBudget
}

function publisherLabelForTick(raw: string): string {
  if (raw === UNKNOWN_PUBLISHER) return UNKNOWN_PUBLISHER
  if (raw === OTHER_BUCKET) return OTHER_BUCKET
  return getMediaLabel(raw)
}

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
  brandColour,
  lineItemsMap = {},
  campaignSpendToDate,
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

  const channelTotalsSum = useMemo(
    () => channelData.reduce((sum, c) => sum + (Number(c.spend) || 0), 0),
    [channelData],
  )
  const totalSpendToDate =
    typeof campaignSpendToDate === "number" && Number.isFinite(campaignSpendToDate)
      ? campaignSpendToDate
      : channelTotalsSum
  const largestChannel = useMemo(() => {
    if (!channelData.length) return "—"
    const top = [...channelData].sort((a, b) => b.spend - a.spend)[0]
    return top?.channel ?? "—"
  }, [channelData])
  const monthWithHighestSpend = useMemo(() => {
    if (!monthlyData.length) return "—"
    const totals = monthlyData.map((m) => {
      const total = Object.entries(m)
        .filter(([k]) => k !== "month")
        .reduce((sum, [, v]) => sum + (Number(v) || 0), 0)
      return { month: String(m.month), total }
    })
    const top = totals.sort((a, b) => b.total - a.total)[0]
    return top?.month ?? "—"
  }, [monthlyData])

  const currency = (value: number) => formatMoneyCompact(value)

  const mediaChannelPieData = useMemo(
    () =>
      channelData.map((c) => ({
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
          .filter(([k]) => k !== "month")
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

  const normalisedLineItems = useMemo(
    () => normaliseLineItemsByType(lineItemsMap || {}),
    [lineItemsMap],
  )

  const { publisherBarData, publisherTotal } = useMemo(() => {
    const totals = new Map<string, number>()

    Object.values(normalisedLineItems).forEach((items) => {
      if (!Array.isArray(items)) return
      items.forEach((item) => {
        const raw =
          item.publisher || item.platform || item.network || item.site || item.station
        const name =
          raw != null && String(raw).trim().length > 0 ? String(raw).trim() : UNKNOWN_PUBLISHER

        item.bursts?.forEach((burst) => {
          const gross = burstGross(burst)
          if (gross > 0) {
            totals.set(name, (totals.get(name) ?? 0) + gross)
          }
        })
      })
    })

    const rows = Array.from(totals.entries()).map(([publisher, amount]) => ({
      publisher,
      amount,
    }))
    rows.sort((a, b) => b.amount - a.amount)

    let finalRows: typeof rows
    if (rows.length <= MAX_PUBLISHERS) {
      finalRows = rows
    } else {
      const top = rows.slice(0, TOP_N_BEFORE_OTHER)
      const restSum = rows.slice(TOP_N_BEFORE_OTHER).reduce((s, r) => s + r.amount, 0)
      finalRows = [...top, { publisher: OTHER_BUCKET, amount: restSum }]
    }

    const sumTotal = finalRows.reduce((s, r) => s + r.amount, 0)
    const barData = [...finalRows]
      .sort((a, b) => a.amount - b.amount)
      .map((r) => ({
        cat: publisherLabelForTick(r.publisher),
        value: r.amount,
      }))

    return { publisherBarData: barData, publisherTotal: sumTotal }
  }, [normalisedLineItems])

  if (!channelData.length && !monthlyData.length) {
    return (
      <Panel className="border-border/60 bg-card shadow-none">
        <PanelHeader className="p-4">
          <PanelTitle className="text-base">Planned media insights</PanelTitle>
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
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Planned media insights</h3>
          <p className="text-sm text-muted-foreground">Planned channel mix and monthly media (not delivered spend)</p>
        </div>
        {dateRangeLabel ? (
          <span className="inline-flex rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            {dateRangeLabel}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Panel className="border-border/60 bg-background/80 shadow-none">
          <PanelContent standalone className="p-4">
            <p className="text-xs text-muted-foreground">Planned to date</p>
            <p className="text-lg font-semibold">{currency(totalSpendToDate)}</p>
          </PanelContent>
        </Panel>
        <Panel className="border-border/60 bg-background/80 shadow-none">
          <PanelContent standalone className="p-4">
            <p className="text-xs text-muted-foreground">Largest planned channel</p>
            <p className="text-lg font-semibold">{largestChannel}</p>
          </PanelContent>
        </Panel>
        <Panel className="border-border/60 bg-background/80 shadow-none">
          <PanelContent standalone className="p-4">
            <p className="text-xs text-muted-foreground">Month with highest planned media</p>
            <p className="text-lg font-semibold">{monthWithHighestSpend}</p>
          </PanelContent>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
        <BaseChartCard
          title="Planned media by type"
          subtitle={`${MEDIA_MIX_DONUT_BASIS_CAPTION} · Total: ${chartFmt.currencyCompact(mediaChannelTotal)}`}
          exportPage="dashboard"
          exportSeries={{
            data: mediaChannelDonutData,
            xKey: "label",
            seriesKeys: ["value"],
          }}
        >
          {mediaChannelTotal > 0 ? (
            <DonutChart
              data={mediaChannelDonutData}
              centerValue={chartFmt.currencyCompact(mediaChannelTotal)}
              centerLabel="Total"
              valueFormat="dollars"
              plotHeight={CHART_PLOT_HEIGHT}
              className="w-full"
            />
          ) : (
            <EmptyState
              className={`${CHART_EMPTY_CLASS} border-0 bg-transparent`}
              title="No planned media data available"
              message={null}
            />
          )}
        </BaseChartCard>

        <BaseChartCard
          title="Planned media by publisher"
          subtitle="Top publishers by planned gross media"
          exportPage="dashboard"
          exportSeries={{
            data: publisherBarData,
            xKey: "cat",
            seriesKeys: ["value"],
          }}
        >
          {publisherBarData.length > 0 && publisherTotal > 0 ? (
            <HorizontalBarChart
              data={publisherBarData}
              xKey="cat"
              series={[{ key: "value", label: "Planned" }]}
              valueFormat="dollars"
              plotHeight={CHART_PLOT_HEIGHT}
              className="w-full"
            />
          ) : (
            <EmptyState
              className={`${CHART_EMPTY_CLASS} border-0 bg-transparent`}
              title="No publisher plan from line items"
              message={null}
            />
          )}
        </BaseChartCard>
      </div>

      <BaseChartCard
        title="Planned media by month"
        subtitle={`gross media by month, planned · As at ${asAtDate}`}
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
    </section>
  )
}
