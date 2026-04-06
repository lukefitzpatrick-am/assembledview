"use client"

import { useMemo } from "react"
import { ChartNoAxesColumnDecreasing, Layers } from "lucide-react"

import MediaChannelPieChart from "@/app/dashboard/[slug]/[mba_number]/components/MediaChannelPieChart"
import MonthlySpendStackedChart from "@/app/dashboard/[slug]/[mba_number]/components/MonthlySpendStackedChart"
import SpendByPublisherChart from "@/app/dashboard/[slug]/[mba_number]/components/SpendByPublisherChart"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@/components/layout/Panel"
import { formatCurrencyFull } from "@/lib/format/currency"

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
  lineItemsMap?: Record<string, any[]>
  /** Prorated planned spend to date (matches campaign summary when monthly data exists) */
  campaignSpendToDate?: number
}

const CHART_PLOT_HEIGHT = 300

const parseAmount = (value: any): number => {
  if (value === null || value === undefined) return 0
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]+/g, ""))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
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

const getMonthLabel = (value: any): string => {
  if (!value) return "Unknown"
  const parsed = parseMonthYearLabel(value)
  if (parsed) {
    return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" })
  }
  return String(value)
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
  const derivedFromDelivery = useMemo(() => {
    const parsedSchedule = Array.isArray(deliverySchedule)
      ? deliverySchedule
      : (() => {
          if (typeof deliverySchedule === "string") {
            try {
              const parsed = JSON.parse(deliverySchedule)
              return Array.isArray(parsed) ? parsed : null
            } catch {
              return null
            }
          }
          return null
        })()

    if (!parsedSchedule || parsedSchedule.length === 0) return null

    const channelTotals: Record<string, number> = {}
    const monthlyMap: Record<string, Record<string, number>> = {}

    parsedSchedule.forEach((entry) => {
      const monthLabel = getMonthLabel(
        entry?.month ??
          entry?.monthYear ??
          entry?.month_year ??
          entry?.monthLabel ??
          entry?.month_label ??
          entry?.period_start ??
          entry?.periodStart ??
          entry?.date ??
          entry?.startDate
      )

      const topLevelAmount = parseAmount(
        entry?.spend ??
          entry?.amount ??
          entry?.budget ??
          entry?.value ??
          entry?.investment ??
          entry?.media_investment ??
          entry?.total ??
          entry?.totalAmount
      )

      let applied = false

      const mediaTypes = Array.isArray(entry?.mediaTypes) ? entry.mediaTypes : []
      if (mediaTypes.length) {
        mediaTypes.forEach((mt: any) => {
          const channel =
            mt?.mediaType ||
            mt?.media_type ||
            mt?.type ||
            mt?.name ||
            mt?.channel ||
            entry?.channel ||
            entry?.media_channel ||
            "Other"

          const lineItems = Array.isArray(mt?.lineItems) ? mt.lineItems : []
          const lineTotal = lineItems.reduce((sum: number, li: any) => sum + parseAmount(li?.amount), 0)
          const amount = lineTotal > 0 ? lineTotal : topLevelAmount
          if (amount > 0) {
            channelTotals[channel] = (channelTotals[channel] || 0) + amount
            monthlyMap[monthLabel] = monthlyMap[monthLabel] || {}
            monthlyMap[monthLabel][channel] = (monthlyMap[monthLabel][channel] || 0) + amount
            applied = true
          }
        })
      }

      if (!applied && topLevelAmount > 0) {
        const fallbackChannel =
          entry?.channel ||
          entry?.media_channel ||
          entry?.mediaType ||
          entry?.media_type ||
          entry?.publisher ||
          entry?.placement ||
          "Other"

        channelTotals[fallbackChannel] = (channelTotals[fallbackChannel] || 0) + topLevelAmount
        monthlyMap[monthLabel] = monthlyMap[monthLabel] || {}
        monthlyMap[monthLabel][fallbackChannel] = (monthlyMap[monthLabel][fallbackChannel] || 0) + topLevelAmount
      }
    })

    const channelData = Object.entries(channelTotals).map(([channel, spend]) => ({ channel, spend }))
    const campaignMap: Record<string, number> = {}

    const monthlyData: MonthlySpendByChannel[] = Object.entries(monthlyMap)
      .map(([month, data]) => {
        const row: MonthlySpendByChannel = { month }
        Object.entries(data).forEach(([mediaType, amount]) => {
          row[mediaType] = amount
        })
        return row
      })
      .sort((a, b) => {
        const aDate = new Date(a.month as string).getTime()
        const bDate = new Date(b.month as string).getTime()
        if (isNaN(aDate) || isNaN(bDate)) return String(a.month).localeCompare(String(b.month))
        return aDate - bDate
      })

    parsedSchedule.forEach((entry) => {
      const campaignName =
        entry?.campaignName || entry?.campaign_name || entry?.campaign || entry?.plan_name || entry?.name || null
      if (!campaignName) return
      const amount = parseAmount(entry?.spend ?? entry?.amount ?? entry?.budget ?? entry?.value ?? entry?.media_investment)
      if (amount <= 0) return
      campaignMap[String(campaignName)] = (campaignMap[String(campaignName)] || 0) + amount
    })

    return { channelData, monthlyData, campaignData: Object.entries(campaignMap).map(([label, value]) => ({ label, value })) }
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
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    return `${fmt(sorted[0])} - ${fmt(sorted[sorted.length - 1])}`
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

  const currency = (value: number) => formatCurrencyFull(value, "AUD")

  const mediaChannelPieData = useMemo(() => {
    const total = channelData.reduce((s, c) => s + (Number(c.spend) || 0), 0)
    return channelData.map((c) => ({
      mediaType: c.channel,
      amount: Number(c.spend) || 0,
      percentage: total > 0 ? ((Number(c.spend) || 0) / total) * 100 : 0,
    }))
  }, [channelData])

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

  if (!channelData.length && !monthlyData.length) {
    return (
      <Panel className="border-border/60 bg-card shadow-none">
        <PanelHeader className="p-4">
          <PanelTitle className="text-base">Spend &amp; delivery insights</PanelTitle>
        </PanelHeader>
        <PanelContent standalone className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="rounded-full bg-muted p-3 text-muted-foreground">
            <ChartNoAxesColumnDecreasing className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium text-foreground">No spend data available for this period</p>
          <p className="text-xs text-muted-foreground">Try adjusting your selected date range and refresh.</p>
        </PanelContent>
      </Panel>
    )
  }

  return (
    <section className="w-full space-y-4 rounded-2xl border border-border/60 bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Spend &amp; delivery insights</h3>
          <p className="text-sm text-muted-foreground">Channel distribution and monthly trends</p>
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
            <p className="text-xs text-muted-foreground">Total spend to date</p>
            <p className="text-lg font-semibold">{currency(totalSpendToDate)}</p>
          </PanelContent>
        </Panel>
        <Panel className="border-border/60 bg-background/80 shadow-none">
          <PanelContent standalone className="p-4">
            <p className="text-xs text-muted-foreground">Largest channel</p>
            <p className="text-lg font-semibold">{largestChannel}</p>
          </PanelContent>
        </Panel>
        <Panel className="border-border/60 bg-background/80 shadow-none">
          <PanelContent standalone className="p-4">
            <p className="text-xs text-muted-foreground">Month with highest spend</p>
            <p className="text-lg font-semibold">{monthWithHighestSpend}</p>
          </PanelContent>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch">
        <MediaChannelPieChart data={mediaChannelPieData} />
        <SpendByPublisherChart lineItems={lineItemsMap} chartHeight={CHART_PLOT_HEIGHT} />
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="mb-4 flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
            <Layers className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-sm font-semibold text-foreground">Monthly spend by channel</h3>
            <p className="text-xs text-muted-foreground">
              Stacked gross media by month · As at {asAtDate}
            </p>
          </div>
        </div>

        <MonthlySpendStackedChart
          data={monthlySpendStackedInput}
          chartHeight={CHART_PLOT_HEIGHT}
          hideFooterNote
        />
      </div>
    </section>
  )
}
