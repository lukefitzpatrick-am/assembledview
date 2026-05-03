/**
 * Shared Recharts styling for dashboard pacing line charts (Search / Social / Programmatic).
 * Tooltip shell matches `UnifiedTooltip` (solid white panel); today line matches MediaGanttChart sky-500/70 dashed.
 */
export const PACING_TOOLTIP_SHELL_CLASS =
  "rounded-lg border border-border/80 bg-white p-3 text-foreground shadow-lg"

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
