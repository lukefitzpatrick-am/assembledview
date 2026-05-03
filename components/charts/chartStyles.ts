import type { CSSProperties } from "react"

/**
 * @deprecated Prefer `useUnifiedTooltip` / `UnifiedTooltip` from
 * `@/components/charts/UnifiedTooltip` — legacy Recharts inline tooltip styles;
 * solid white shell is standard for dashboard charts.
 */
export const CHART_TOOLTIP_CONTENT: CSSProperties = {
  backgroundColor: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
}

/**
 * @deprecated Prefer `useUnifiedTooltip` / `UnifiedTooltip` from
 * `@/components/charts/UnifiedTooltip`.
 */
export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "hsl(var(--popover-foreground))",
  fontWeight: 600,
}

/**
 * @deprecated Prefer `useUnifiedTooltip` / `UnifiedTooltip` from
 * `@/components/charts/UnifiedTooltip`.
 */
export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: "hsl(var(--popover-foreground))",
}

/** @deprecated Use `useUnifiedTooltip` / `UnifiedTooltip` from `@/components/charts/UnifiedTooltip`. */
export const CD_CHART_TOOLTIP_CONTENT = CHART_TOOLTIP_CONTENT

/** @deprecated Use `useUnifiedTooltip` / `UnifiedTooltip` from `@/components/charts/UnifiedTooltip`. */
export const CD_CHART_TOOLTIP_LABEL_STYLE = CHART_TOOLTIP_LABEL_STYLE

/** @deprecated Use `useUnifiedTooltip` / `UnifiedTooltip` from `@/components/charts/UnifiedTooltip`. */
export const CD_CHART_TOOLTIP_ITEM_STYLE = CHART_TOOLTIP_ITEM_STYLE
