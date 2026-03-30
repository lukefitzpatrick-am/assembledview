import * as React from "react"

import { cn } from "@/lib/utils"

export type PanelRowProps = Omit<React.HTMLAttributes<HTMLElement>, "title"> & {
  /** Section heading (e.g. field group label). Omit when panels supply their own titles. */
  title?: React.ReactNode
  helperText?: React.ReactNode
  /** Shown on the right of the heading row (e.g. layout toggle). */
  actions?: React.ReactNode
}

/**
 * Section with a heading and a 12-column grid. On small screens each cell spans the full row;
 * from `md` upward, `PanelRowCell` defaults to half width (6 columns).
 */
const PanelRow = React.forwardRef<HTMLElement, PanelRowProps>(
  ({ className, title, helperText, actions, children, ...props }, ref) => {
    const hasHeading = title != null || helperText != null
    return (
    <section ref={ref} className={cn("space-y-4", className)} {...props}>
      {hasHeading || actions != null ? (
        <div
          className={cn(
            "flex flex-col gap-3 sm:flex-row sm:items-start",
            hasHeading ? "sm:justify-between" : "sm:justify-end",
          )}
        >
          {hasHeading ? (
            <div className="min-w-0 space-y-1.5">
              {title != null ? (
                <h3 className="text-base font-semibold leading-none tracking-tight text-foreground">{title}</h3>
              ) : null}
              {helperText != null ? <p className="text-sm text-muted-foreground">{helperText}</p> : null}
            </div>
          ) : null}
          {actions != null ? <div className="shrink-0 sm:pt-0.5">{actions}</div> : null}
        </div>
      ) : null}
      <div className="grid grid-cols-12 gap-4">{children}</div>
    </section>
    )
  }
)
PanelRow.displayName = "PanelRow"

const spanPresets = {
  full: "col-span-12",
  half: "col-span-12 md:col-span-6",
  third: "col-span-12 md:col-span-4",
  quarter: "col-span-12 md:col-span-3",
  twoThirds: "col-span-12 md:col-span-8",
} as const

export type PanelRowCellSpan = keyof typeof spanPresets

export type PanelRowCellProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Preset span on the 12-column grid at `md+`. Mobile is always full width unless overridden via `className`. */
  span?: PanelRowCellSpan
}

const PanelRowCell = React.forwardRef<HTMLDivElement, PanelRowCellProps>(
  ({ className, span = "half", ...props }, ref) => (
    <div ref={ref} className={cn(spanPresets[span], className)} {...props} />
  )
)
PanelRowCell.displayName = "PanelRowCell"

export { PanelRow, PanelRowCell, spanPresets }
