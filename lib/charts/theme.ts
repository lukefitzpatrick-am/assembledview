import { cn } from "@/lib/utils"

/** Recharts default grid / reference stroke in the DOM (matches shadcn chart selectors). */
const CHART_RECHARTS_GRID_STROKE = "#ccc" as const

/** Recharts default dot sector stroke in the DOM. */
const CHART_RECHARTS_DOT_STROKE = "#fff" as const

/** Fixed plot height for client dashboard spend / insight charts (avoids aspect-video viewport stretch). */
export const DASHBOARD_CHART_PLOT_HEIGHT = 400

/** `ChartContainer` Recharts surface / grid / dot attribute hooks (single source for #ccc / #fff). */
export function chartContainerRechartsClassNames(extra?: string, plotHeight?: number) {
  const grid = CHART_RECHARTS_GRID_STROKE
  const dot = CHART_RECHARTS_DOT_STROKE
  const sizing = plotHeight != null ? "aspect-auto" : "aspect-video"
  return cn(
    "flex justify-center text-xs",
    sizing,
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
