"use client"

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

type MetricSize = "sm" | "md" | "lg"

export interface MetricCardProps {
  label: string
  value: number
  trend?: number
  unit?: string
  size?: MetricSize
  loading?: boolean
  className?: string
}

const sizeStyles: Record<MetricSize, { wrapper: string; value: string; label: string }> = {
  sm: {
    wrapper: "p-3",
    value: "text-xl",
    label: "text-xs",
  },
  md: {
    wrapper: "p-4",
    value: "text-2xl",
    label: "text-xs",
  },
  lg: {
    wrapper: "p-5",
    value: "text-3xl",
    label: "text-sm",
  },
}

function trendTone(trend = 0): string {
  if (trend > 0.1) return "text-emerald-600"
  if (trend < -0.1) return "text-rose-600"
  return "text-amber-600"
}

function trendIcon(trend = 0) {
  if (trend > 0.1) return <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
  if (trend < -0.1) return <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
  return <ArrowRight className="h-3.5 w-3.5" aria-hidden />
}

export function MetricCard({
  label,
  value,
  trend,
  unit,
  size = "md",
  loading = false,
  className,
}: MetricCardProps) {
  const config = sizeStyles[size]
  const valueLabel = `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}${unit ?? ""}`

  if (loading) {
    return (
      <div className={cn("rounded-xl border border-border/60 bg-card", config.wrapper, className)}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-8 w-32" />
        <Skeleton className="mt-2 h-3 w-20" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card transition-all hover:scale-[1.02] hover:border-border/80 hover:shadow-md",
        config.wrapper,
        className
      )}
    >
      <p className={cn("uppercase tracking-wide text-muted-foreground", config.label)}>{label}</p>
      <p className={cn("mt-2 font-semibold text-foreground", config.value)}>{valueLabel}</p>
      {typeof trend === "number" ? (
        <div className={cn("mt-2 inline-flex items-center gap-1 text-xs font-medium", trendTone(trend))}>
          {trendIcon(trend)}
          {Math.abs(trend).toLocaleString("en-US", { maximumFractionDigits: 1 })}%
        </div>
      ) : null}
    </div>
  )
}
