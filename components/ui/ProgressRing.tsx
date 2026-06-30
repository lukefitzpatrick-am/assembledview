"use client"

import * as React from "react"
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts"

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
  strokeWidth = 10,
  label = "delivery",
  className,
  style,
  ...props
}: ProgressRingProps) {
  const clamped = clampPercent(value)
  const rounded = Math.round(clamped)
  const radius = size / 2
  const innerRadius = Math.max(0, radius - strokeWidth)
  const outerRadius = radius
  const endAngle = 90 - clamped * 3.6
  const colour = STATUS_COLOURS[status]

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size, ...style }}
      role="img"
      aria-label={`${label}: ${rounded}%`}
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={[{ name: "track", value: 100 }]}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
            stroke="none"
          >
            <Cell fill="var(--fill-track)" />
          </Pie>
          {clamped > 0 ? (
            <Pie
              data={[{ name: "value", value: 1 }]}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              startAngle={90}
              endAngle={endAngle}
              cornerRadius={strokeWidth}
              isAnimationActive={false}
              stroke="none"
            >
              <Cell fill={colour} />
            </Pie>
          ) : null}
        </PieChart>
      </ResponsiveContainer>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">
        <span className="num">{rounded}%</span>
      </span>
    </div>
  )
}
