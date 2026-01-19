"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SpendChannelCharts } from "@/components/dashboard/pacing/SpendChannelCharts"

type ChannelSpend = {
  mediaType: string
  amount: number
}

type MonthlySpendEntry = {
  month: string
  data: Array<{ mediaType: string; amount: number }>
}

type SpendChartsRowProps = {
  spendByChannel: ChannelSpend[]
  monthlySpendByChannel: MonthlySpendEntry[]
  deliverySchedule?: any[]
}

const palette = ["#6366f1", "#22c55e", "#f97316", "#06b6d4", "#f43f5e", "#a855f7", "#0ea5e9", "#f59e0b"]

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

export default function SpendChartsRow({ spendByChannel, monthlySpendByChannel, deliverySchedule }: SpendChartsRowProps) {
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

    const monthlyData = Object.entries(monthlyMap)
      .map(([month, data]) => {
        const row: Record<string, number | string> = { month }
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

    return { channelData, monthlyData }
  }, [deliverySchedule])

  const channelData = useMemo(() => {
    if (derivedFromDelivery?.channelData?.length) return derivedFromDelivery.channelData
    return spendByChannel.map((entry, idx) => ({
      channel: entry.mediaType || `Channel ${idx + 1}`,
      spend: entry.amount ?? 0,
    }))
  }, [derivedFromDelivery, spendByChannel])

  const channelColors = useMemo(() => {
    const map: Record<string, string> = {}
    channelData.forEach((entry, idx) => {
      const key = entry.channel || `Channel ${idx + 1}`
      map[key] = palette[idx % palette.length]
    })
    return map
  }, [channelData])

  const monthlyData = useMemo(() => {
    if (derivedFromDelivery?.monthlyData?.length) return derivedFromDelivery.monthlyData
    return monthlySpendByChannel.map((entry) => {
      const row: Record<string, number | string> = { month: entry.month }
      entry.data.forEach((d) => {
        row[d.mediaType] = d.amount ?? 0
      })
      return row
    })
  }, [derivedFromDelivery, monthlySpendByChannel])

  return (
    <Card className="w-full rounded-3xl border-muted/70 bg-background/90 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Channel spend</CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <SpendChannelCharts channelData={channelData} monthlyData={monthlyData} channelColors={channelColors} />
      </CardContent>
    </Card>
  )
}
