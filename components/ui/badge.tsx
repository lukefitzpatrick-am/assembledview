import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        success: "border-transparent bg-pacing-ahead-bg text-status-ahead-fg",
        ahead: "border-transparent bg-pacing-ahead-bg text-status-ahead-fg",
        /** Semantic: soft green — In MBA / billable=MBA / all-in complete */
        good: "border-transparent bg-status-good-bg text-status-good-fg",
        info: "border-transparent bg-pacing-on-track-bg text-status-on-track-fg",
        "on-track": "border-transparent bg-pacing-on-track-bg text-status-on-track-fg",
        warning: "border-transparent bg-pacing-behind-bg text-status-behind-fg",
        behind: "border-transparent bg-pacing-behind-bg text-status-behind-fg",
        /** Semantic: amber — Partial / Manual / Fee adjusted / Prepay */
        attention: "border-transparent bg-status-attention-bg text-status-attention-fg",
        danger: "border-transparent bg-pacing-critical-bg text-status-critical-fg",
        critical: "border-transparent bg-pacing-critical-bg text-status-critical-fg",
        /** Semantic: coral/red — billing ≠ MBA / sum violation */
        blocking: "border-transparent bg-status-blocking-bg text-status-blocking-fg",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        interactive:
          "cursor-pointer border-transparent transition-colors hover:bg-[var(--row-hover)]",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-1 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
  customColor?: string
}

function Badge({ className, variant, size, dot = false, customColor, style, children, ...props }: BadgeProps) {
  const mergedStyle = customColor
    ? {
        backgroundColor: `${customColor}1f`,
        color: customColor,
        borderColor: "transparent",
        ...style,
      }
    : style

  return (
    <span className={cn(badgeVariants({ variant, size }), className)} style={mergedStyle} {...props}>
      {dot ? (
        <span
          className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current"
          style={customColor ? { backgroundColor: customColor } : undefined}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
