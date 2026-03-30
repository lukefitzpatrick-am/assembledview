import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        success: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        warning: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300",
        danger: "border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300",
        info: "border-transparent bg-blue-500/15 text-blue-700 dark:text-blue-300",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
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
          className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
          style={customColor ? { backgroundColor: customColor } : undefined}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
