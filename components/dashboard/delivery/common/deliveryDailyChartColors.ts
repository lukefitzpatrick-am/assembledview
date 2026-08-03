import { NEUTRAL } from "@/lib/chart-theme"

/**
 * Dual-axis metric line (impressions / clicks / etc.).
 * Theme ink — not a STATUS pacing token and not any MEDIA_TYPE_REGISTRY hue.
 * Resolves via `--av-ink`: #0F1D13 (light) / #e6ede7 (dark).
 */
export const DELIVERY_DAILY_METRIC_LINE_COLOR = NEUTRAL.ink

/** Concrete theme hexes for collision tests (mirrors styles/chart-tokens.css --av-ink). */
export const DELIVERY_DAILY_METRIC_LINE_THEME_HEXES = ["#0F1D13", "#e6ede7"] as const
