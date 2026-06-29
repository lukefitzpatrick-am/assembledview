/**
 * Central chart appearance tokens. Consume these instead of scattering hex in components.
 *
 * - User brand_colour and per-channel colour maps stay as runtime props/records.
 * - Domain media colours remain in `mediaTypeTheme` (lib/utils).
 * - MediaGanttChart keeps a local Excel-parity constant.
 */

import { cn } from "@/lib/utils"

/** Recharts default grid / reference stroke in the DOM (matches shadcn chart selectors). */
const CHART_RECHARTS_GRID_STROKE = "#ccc" as const

/** Recharts default dot sector stroke in the DOM. */
const CHART_RECHARTS_DOT_STROKE = "#fff" as const

/**
 * Timeline / media-plan viz: same ramp as categorical but indigo-600 lead (seven stops).
 * Preserves previous MediaPlanViz bar colours.
 */
export const CHART_CHANNEL_FALLBACK_FILL = "#4f46e5" as const

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
