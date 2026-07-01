"use client"

import * as React from "react"

import { GaugeChart } from "@/components/charts/system"
import { cn } from "@/lib/utils"

export type ProgressRingStatus =
  | "ahead"
  | "on-track"
  | "behind"
  | "critical"
  | "pacing-ahead"
  | "pacing-on-track"
  | "pacing-behind"
  | "pacing-critical"

export type ProgressRingProps = React.HTMLAttributes<HTMLDivElement> & {
  value: number
  status?: ProgressRingStatus
  size?: number
  strokeWidth?: number
  label?: string
}

const STATUS_COLOURS: Record<ProgressRingStatus, string> = {
  ahead: "var(--pacing-ahead)",
  "on-track": "var(--pacing-on-track)",
  behind: "var(--pacing-behind)",
  critical: "var(--pacing-critical)",
  "pacing-ahead": "var(--pacing-ahead)",
  "pacing-on-track": "var(--pacing-on-track)",
  "pacing-behind": "var(--pacing-behind)",
  "pacing-critical": "var(--pacing-critical)",
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export function ProgressRing({
  value,
  status = "on-track",
  size = 96,
  label = "delivery",
  className,
  style,
  ...props
}: ProgressRingProps) {
  const clamped = clampPercent(value)
  const rounded = Math.round(clamped)
  const colour = STATUS_COLOURS[status]

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size, ...style }}
      role="img"
      aria-label={`${label}: ${rounded}%`}
      {...props}
    >
      <GaugeChart value={clamped} label={label} color={colour} className="h-full w-full" />
    </div>
  )
}
