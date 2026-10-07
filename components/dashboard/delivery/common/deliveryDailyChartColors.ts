import { getChartTheme, NEUTRAL } from "@/lib/chart-theme"

/**
 * Dual-axis metric line (impressions / clicks / etc.).
 * Theme ink — not a STATUS pacing token and not any MEDIA_TYPE_REGISTRY hue.
 * Resolves via `--av-ink`. Concrete hexes are the chart theme value labels.
 */
export const DELIVERY_DAILY_METRIC_LINE_COLOR = NEUTRAL.ink

/** Concrete theme hexes for collision tests (light ink, dark white). */
export const DELIVERY_DAILY_METRIC_LINE_THEME_HEXES = [
  getChartTheme("light").valueLabel,
  getChartTheme("dark").valueLabel,
] as const
