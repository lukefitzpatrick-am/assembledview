import type { CSSProperties } from "react"

/** Recharts tooltip panel aligned with shadcn popover tokens (not default white). */
export const CHART_TOOLTIP_CONTENT: CSSProperties = {
  backgroundColor: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
}

export const CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "hsl(var(--popover-foreground))",
  fontWeight: 600,
}

export const CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: "hsl(var(--popover-foreground))",
}

/** @deprecated Use `CHART_TOOLTIP_CONTENT` */
export const CD_CHART_TOOLTIP_CONTENT = CHART_TOOLTIP_CONTENT

/** @deprecated Use `CHART_TOOLTIP_LABEL_STYLE` */
export const CD_CHART_TOOLTIP_LABEL_STYLE = CHART_TOOLTIP_LABEL_STYLE

/** @deprecated Use `CHART_TOOLTIP_ITEM_STYLE` */
export const CD_CHART_TOOLTIP_ITEM_STYLE = CHART_TOOLTIP_ITEM_STYLE
