import {
  chartWindow,
  fitDailyRows,
  isoDay,
  type ChartDateFilter,
  type LineChartDates,
} from "@/lib/delivery/lineChartWindow"
import type { ChannelSectionData } from "./types"

/**
 * One date rule for every daily delivery chart in a channel section.
 *
 * - Line charts: line start to today, or to line end once finished.
 * - Channel chart: earliest line start to today, or to the latest line end.
 * - A date filter narrows both. Missing days are zero-filled.
 *
 * Only the chart rows change. Pacing, KPI and totals maths is untouched.
 */
export function fitSectionCharts(
  section: ChannelSectionData,
  opts: { todayISO: string; filter?: ChartDateFilter | null },
): ChannelSectionData {
  const campaign: LineChartDates = {
    startISO: isoDay(section.dateRange.startISO),
    endISO: isoDay(section.dateRange.endISO),
  }

  let earliest: string | null = null
  let latest: string | null = null

  const lineItems = section.lineItems.map((li) => {
    const chart = li.block.chart
    if (chart.kind !== "daily-delivery") return li
    const dates = chart.lineDates ?? campaign
    if (dates.startISO && (!earliest || dates.startISO < earliest)) earliest = dates.startISO
    if (dates.endISO && (!latest || dates.endISO > latest)) latest = dates.endISO
    const window = chartWindow(dates, opts)
    if (!window) return li
    const keys = chart.series.map((s) => s.key)
    return {
      ...li,
      block: {
        ...li.block,
        chart: {
          ...chart,
          daily: fitDailyRows(chart.daily, window, keys),
          startsOn: dates.startISO,
        },
      },
    }
  })

  const aggDates: LineChartDates = {
    startISO: earliest ?? campaign.startISO,
    endISO: latest ?? campaign.endISO,
  }
  const aggWindow = chartWindow(aggDates, opts)
  const aggChart = section.aggregate.chart
  const aggregate = aggWindow
    ? {
        ...section.aggregate,
        chart: {
          ...aggChart,
          daily: fitDailyRows(aggChart.daily, aggWindow, aggChart.series.map((s) => s.key)),
          startsOn: aggDates.startISO,
        },
      }
    : section.aggregate

  return { ...section, lineItems, aggregate }
}
