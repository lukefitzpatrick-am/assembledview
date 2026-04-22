/** Single headline KPI tile (matches dashboard metric cards). */
export type MetricEntry = {
  label: string
  /** Human-readable primary value (e.g. currency or count with grouping). */
  value: string
  /** Signed % change vs prior period; null when not applicable. */
  deltaPct: number | null
  /** When true, a negative delta is “good” (e.g. cost down). */
  invertDelta?: boolean
}

/** One row in the “snapshot” strip (label + primary metric string). */
export type SnapshotEntry = {
  label: string
  value: string
  hint?: string
}

/** Daily traffic by acquisition channel (MoliCare-style). */
export type ChannelDailyRow = {
  date: string
  paidSocial: number
  paidSearch: number
  organic: number
  direct: number
  referral: number
}

/** Daily revenue + orders (Curatif-style). */
export type RevenueDailyRow = {
  date: string
  revenue: number
  transactions: number
}

/** Ordered funnel stage counts (must be non-increasing down-funnel). */
export type FunnelStage = {
  label: string
  value: number
}

/** Waterfall bridge step (Curatif / generic). */
export type WaterfallEntry = {
  label: string
  value: number
  type: "start" | "positive" | "negative" | "total"
}

/** Rose / nightingale slice. */
export type NightingaleEntry = {
  label: string
  value: number
}

/** Waffle / budget mix slice (percent of whole). */
export type BudgetMixEntry = {
  label: string
  pct: number
}

/** Treemap leaf (views + optional engagement intensity 0–100). */
export type TreemapEntry = {
  name: string
  size: number
  intensity?: number
}

/** Matrix heatmap payload (row-major `data[r][c]`). */
export type HeatmapMatrix = {
  rowLabels: string[]
  colLabels: string[]
  data: number[][]
}

/** Box-and-whisker series. */
export type BoxPlotEntry = {
  label: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
  outliers?: number[]
}

/** Acquisition source / medium performance row. */
export type SourceMediumRow = {
  sourceMedium: string
  sessions: number
  conversions: number
  conversionRatePct: number
}

/** Revenue split by channel and customer type. */
export type ChannelRevenueRow = {
  channel: string
  newCustomerRevenue: number
  returningCustomerRevenue: number
}

/** Top product SKU row. */
export type TopProductRow = {
  name: string
  units: number
  revenue: number
  deltaPct: number
}
