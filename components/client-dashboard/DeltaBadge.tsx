"use client"

import { ArrowDown, ArrowUp } from "lucide-react"

import { cn } from "@/lib/utils"

export type DeltaBadgeProps = {
  value: number | null | undefined
  inverted?: boolean
}

function formatPercent(value: number): string {
  if (Math.abs(value) < 1e-9) {
    return "0%"
  }
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 0 : 1
  let body = abs.toFixed(digits)
  if (digits === 1) {
    body = body.replace(/\.0$/, "")
  }
  const sign = value > 0 ? "+" : "-"
  return `${sign}${body}%`
}

type Tone = "good" | "bad" | "neutral"

function toneFor(value: number, inverted: boolean): Tone {
  if (Math.abs(value) < 1e-9) return "neutral"
  const up = value > 0
  if (inverted) {
    return up ? "bad" : "good"
  }
  return up ? "good" : "bad"
}

export function DeltaBadge({ value, inverted = false }: DeltaBadgeProps) {
  if (value === null || value === undefined) {
    return null
  }

  const tone = toneFor(value, inverted)
  const label = formatPercent(value)

  const className = cn(
    "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums tracking-tight",
    tone === "good" && "text-emerald-600",
    tone === "bad" && "text-rose-600",
    tone === "neutral" && "text-muted-foreground",
  )

  if (tone === "neutral") {
    return <span className={className}>{label}</span>
  }

  const Icon = value > 0 ? ArrowUp : ArrowDown

  return (
    <span className={className}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{label}</span>
    </span>
  )
}
