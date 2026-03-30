"use client"

import { useMemo } from "react"

import { cn } from "@/lib/utils"

type ProgressColor = "default" | "success" | "warning" | "danger" | "info"
type ProgressSize = "sm" | "md" | "lg"

export interface ProgressBarProps {
  value: number
  max?: number
  size?: ProgressSize
  color?: ProgressColor
  customColor?: string
  showLabel?: boolean
  animated?: boolean
  className?: string
}

const sizeClass: Record<ProgressSize, string> = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-3.5",
}

const toneClass: Record<ProgressColor, string> = {
  default: "bg-primary",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-blue-500",
}

export function ProgressBar({
  value,
  max = 100,
  size = "md",
  color = "default",
  customColor,
  showLabel = false,
  animated = true,
  className,
}: ProgressBarProps) {
  const percentage = useMemo(() => {
    if (max <= 0) return 0
    return Math.max(0, Math.min(100, (value / max) * 100))
  }, [max, value])

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("w-full overflow-hidden rounded-full bg-muted", sizeClass[size])}>
        <div
          className={cn("h-full rounded-full", customColor ? "" : toneClass[color])}
          style={{
            width: `${percentage}%`,
            backgroundColor: customColor,
            transition: animated ? "width 700ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
          }}
          aria-hidden
        />
      </div>
      {showLabel ? <p className="mt-1 text-xs text-muted-foreground">{Math.round(percentage)}%</p> : null}
    </div>
  )
}
