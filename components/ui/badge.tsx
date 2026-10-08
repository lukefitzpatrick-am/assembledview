import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toneOutcome = "border-transparent bg-tone-outcome-bg text-tone-outcome-fg"
const toneInsight = "border-transparent bg-tone-insight-bg text-tone-insight-fg"
const toneAction = "border-transparent bg-tone-action-bg text-tone-action-fg"
const toneAttention = "border-transparent bg-tone-attention-bg text-tone-attention-fg"
const toneCritical = "border-transparent bg-tone-critical-bg text-tone-critical-fg"
const toneNeutral = "border-transparent bg-tone-neutral-bg text-tone-neutral-fg"
const toneInk = "border-transparent bg-tone-ink-bg text-tone-ink-fg"
const toneCancelled = "border-transparent bg-tone-neutral-bg text-muted-foreground line-through"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        success: toneAction,
        ahead: toneAction,
        /** Semantic: soft green — In MBA / billable=MBA / all-in complete */
        good: toneAction,
        info: toneInsight,
        "on-track": toneAction,
        warning: toneAttention,
        behind: toneAttention,
        /** Semantic: amber — Partial / Manual / Fee adjusted / Prepay */
        attention: toneAttention,
        danger: toneCritical,
        critical: toneCritical,
        /** Semantic: coral/red — billing ≠ MBA / sum violation */
        blocking: toneCritical,
        outcome: toneOutcome,
        insight: toneInsight,
        action: toneAction,
        neutral: toneNeutral,
        ink: toneInk,
        cancelled: toneCancelled,
        secondary: "border-transparent bg-muted text-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "border-border text-foreground",
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
}

function Badge({ className, variant, size, dot = false, style, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} style={style} {...props}>
      {dot ? (
        <span
          className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
