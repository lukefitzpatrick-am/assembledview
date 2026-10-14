/**
 * Dashboard daily-chart series. Shared with the report deck so both
 * axes stay the same lists. No React.
 */

export type ChannelChartSeries = {
  key: string
  label: string
  yAxis: "left" | "right"
  format?: "dollars" | "number" | "compact" | "percent"
}

export const SOCIAL_CHART_SERIES: ChannelChartSeries[] = [
  { key: "amount_spent", label: "Spend", yAxis: "left" },
  { key: "impressions", label: "Impressions", yAxis: "right" },
]

export const SEARCH_CHART_SERIES: ChannelChartSeries[] = [
  { key: "cost", label: "Cost", yAxis: "left" },
  { key: "clicks", label: "Clicks", yAxis: "right" },
]

export const PROGRAMMATIC_CHART_SERIES: ChannelChartSeries[] = [
  { key: "amount_spent", label: "Spend", yAxis: "left" },
  { key: "impressions", label: "Impressions", yAxis: "right" },
]

export const PROGRAMMATIC_CPV_CHART_SERIES: ChannelChartSeries[] = [
  { key: "amount_spent", label: "Spend", yAxis: "left" },
  { key: "video_3s_views", label: "Views", yAxis: "right" },
]

export const DIRECT_DIGITAL_IMPRESSIONS_SERIES: ChannelChartSeries = {
  key: "impressions",
  label: "Impressions",
  yAxis: "left",
  format: "number",
}

export const DIRECT_DIGITAL_CLICKS_SERIES: ChannelChartSeries = {
  key: "clicks",
  label: "Clicks",
  yAxis: "right",
  format: "number",
}

export const DIRECT_DIGITAL_COMPLETION_SERIES: ChannelChartSeries = {
  key: "completionRate",
  label: "Completion rate",
  yAxis: "right",
  format: "percent",
}
