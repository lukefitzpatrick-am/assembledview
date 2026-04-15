/**
 * Shared Recharts styling for dashboard pacing line charts (Search / Social / Programmatic).
 * Tooltip shell matches MediaChannelPieChart; today line matches MediaGanttChart sky-500/70 dashed.
 */
export const PACING_TOOLTIP_SHELL_CLASS =
  "rounded-xl border border-border/60 bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur-md"

/** CartesianGrid — align with SpendByPublisherChart dash pattern */
export const PACING_CARTESIAN_GRID_PROPS = {
  strokeDasharray: "3 3" as const,
  strokeOpacity: 0.12,
  stroke: "hsl(var(--muted-foreground))",
}

/** ReferenceLine for “today” / as-at — border-sky-500/70 dashed (MediaGanttChart) */
export const PACING_TODAY_REFERENCE_LINE_PROPS = {
  stroke: "rgb(14 165 233 / 0.7)",
  strokeDasharray: "4 4" as const,
}
