/**
 * Central chart appearance tokens. Consume these instead of scattering hex in components.
 *
 * - User brand_colour and per-channel colour maps stay as runtime props/records.
 * - Domain media colours remain in `mediaTypeTheme` (lib/utils).
 * - MediaGanttChart keeps a local Excel-parity constant.
 */

import { cn, theme } from "@/lib/utils"

/** Recharts default grid / reference stroke in the DOM (matches shadcn chart selectors). */
export const CHART_RECHARTS_GRID_STROKE = "#ccc" as const

/** Recharts default dot sector stroke in the DOM. */
export const CHART_RECHARTS_DOT_STROKE = "#fff" as const

/** Default pie placeholder before Cells assign fills (Recharts / legacy dashboards). */
export const CHART_RECHARTS_PLACEHOLDER_PURPLE = "#8884d8" as const

/**
 * Categorical series palette (Tailwind-ish). Used by `getSeriesColours` and spend dashboards
 * that need the full eight-step ramp including amber.
 */
export const CHART_SERIES_CATEGORICAL = [
  "#6366f1",
  "#22c55e",
  "#f97316",
  "#06b6d4",
  "#f43f5e",
  "#a855f7",
  "#0ea5e9",
  "#f59e0b",
] as const

/**
 * Timeline / media-plan viz: same ramp as categorical but indigo-600 lead (seven stops).
 * Preserves previous MediaPlanViz bar colours.
 */
export const CHART_CHANNEL_FALLBACK_FILL = "#4f46e5" as const

export const CHART_MEDIA_PLAN_TIMELINE_PALETTE = [
  CHART_CHANNEL_FALLBACK_FILL,
  ...CHART_SERIES_CATEGORICAL.slice(1, 7),
] as const

/** Budget / time progress bars on campaign MBA cards. */
export const CHART_THRESHOLD = {
  critical: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  positive: "#10b981",
} as const

/**
 * Pacing dashboards: aligned with `theme.colors` in lib/utils (single hex source for brand ramp).
 */
export const CHART_PACING = {
  budget: theme.colors.blue,
  deliverable: theme.colors.teal,
  accent: theme.colors.limeGreen,
  brand: theme.colors.purple,
  highlight: theme.colors.pink,
  warning: theme.colors.yellow,
  alert: theme.colors.orange,
  error: theme.colors.redOrange,
  success: theme.colors.green,
} as const

/** Search pacing line chart series (cost uses theme blue; rest match previous dashboard). */
export const CHART_SEARCH_SERIES = {
  cost: theme.colors.blue,
  clicks: theme.colors.teal,
  conversions: "#22c55e",
  revenue: "#a855f7",
} as const

/** Semi-circular gauge bands (stroke + fill); fills keep prior alpha for legibility. */
export const CHART_GAUGE = {
  behind: {
    stroke: CHART_PACING.error,
    fill: "rgba(255, 96, 3, 0.32)",
  },
  atRisk: {
    stroke: CHART_PACING.warning,
    fill: "rgba(255, 207, 42, 0.32)",
  },
  onTrack: {
    stroke: CHART_PACING.success,
    fill: "rgba(0, 142, 94, 0.3)",
  },
} as const

export const CHART_NEUTRAL = {
  surface: theme.colors.white,
  labelOnDark: "#ffffff",
  /** When a badge/chip has no mapped colour */
  unknownChip: "#666666",
} as const

/** Defaults when optional `brandColour` is missing (dashboard campaign header). */
export const CHART_BRAND_ACCENT_FALLBACK = {
  time: "#6366f1",
  spend: "#8b5cf6",
} as const

export const CHART_PROGRESS_CARD_DEFAULT_ACCENT = "#5b4bff" as const

/** `ChartContainer` Recharts surface / grid / dot attribute hooks (single source for #ccc / #fff). */
export function chartContainerRechartsClassNames(extra?: string) {
  const grid = CHART_RECHARTS_GRID_STROKE
  const dot = CHART_RECHARTS_DOT_STROKE
  return cn(
    "flex aspect-video justify-center text-xs",
    `[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground`,
    `[&_.recharts-cartesian-grid_line[stroke='${grid}']]:stroke-border/50`,
    "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
    `[&_.recharts-dot[stroke='${dot}']]:stroke-transparent`,
    "[&_.recharts-layer]:outline-none",
    `[&_.recharts-polar-grid_[stroke='${grid}']]:stroke-border`,
    "[&_.recharts-radial-bar-background-sector]:fill-muted",
    "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted",
    `[&_.recharts-reference-line_[stroke='${grid}']]:stroke-border`,
    `[&_.recharts-sector[stroke='${dot}']]:stroke-transparent`,
    "[&_.recharts-sector]:outline-none",
    "[&_.recharts-surface]:outline-none",
    extra
  )
}

export function chartThresholdForUtilisation(value: number) {
  if (value >= 100) return CHART_THRESHOLD.critical
  if (value >= 75) return CHART_THRESHOLD.warning
  if (value >= 50) return CHART_THRESHOLD.info
  return CHART_THRESHOLD.positive
}
