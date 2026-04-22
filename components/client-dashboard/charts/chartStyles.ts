import type { CSSProperties } from "react"

/** Recharts tooltip panel aligned with shadcn popover tokens (not default white). */
export const CD_CHART_TOOLTIP_CONTENT: CSSProperties = {
  backgroundColor: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
}

export const CD_CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: "hsl(var(--popover-foreground))",
  fontWeight: 600,
}

export const CD_CHART_TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: "hsl(var(--popover-foreground))",
}
