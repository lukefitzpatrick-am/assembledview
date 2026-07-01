"use client"

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react"
import type { ComponentType, SVGProps } from "react"

import { Sparkline } from "@/components/charts/system"
import { reshapeSparkline } from "@/components/dashboard/dashboardChartReshape"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

type MetricSize = "sm" | "md" | "lg"

export interface MetricCardProps {
  label: string
  value: number | string
  trend?: number
  unit?: string
  size?: MetricSize
  accent?: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  iconClassName?: string
  iconContainerClassName?: string
  sparklineData?: number[]
  sparklineClassName?: string
  loading?: boolean
  className?: string
}

const sizeStyles: Record<MetricSize, string> = {
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
}

function trendTone(trend = 0): string {
  if (trend > 0.1) return "text-status-success"
  if (trend < -0.1) return "text-status-danger"
  return "text-status-behind-fg"
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
  accent = "bg-primary",
  icon: Icon,
  iconClassName,
  iconContainerClassName,
  sparklineData,
  sparklineClassName,
  loading = false,
  className,
}: MetricCardProps) {
  const padding = sizeStyles[size]
  const valueLabel =
    typeof value === "number"
      ? `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}${unit ?? ""}`
      : `${value}${unit ?? ""}`

  if (loading) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-card border border-[var(--dashboard-card-inner)] bg-card shadow-e1",
          className
        )}
      >
        <div className={cn("h-[3px] w-full", accent)} aria-hidden />
        <div className={padding}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-8 w-32" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border border-[var(--dashboard-card-inner)] bg-card shadow-e1",
        className
      )}
    >
      <div className={cn("h-[3px] w-full", accent)} aria-hidden />
      <div className={padding}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          {Icon ? (
            <span className={cn("rounded-pill bg-surface-panel p-2", iconContainerClassName)}>
              <Icon className={cn("h-4 w-4", iconClassName)} aria-hidden />
            </span>
          ) : null}
        </div>
        <p className="num mt-2 text-[28px] font-extrabold leading-none text-foreground">{valueLabel}</p>
        {typeof trend === "number" ? (
          <div className={cn("mt-2 inline-flex items-center gap-1 text-xs font-medium", trendTone(trend))}>
            {trendIcon(trend)}
            {Math.abs(trend).toLocaleString("en-US", { maximumFractionDigits: 1 })}%
          </div>
        ) : null}
        {sparklineData && sparklineData.length > 0 ? (
          <div className={cn("mt-4", sparklineClassName)}>
            <Sparkline
              data={reshapeSparkline(sparklineData)}
              dataKey="value"
              color="var(--primary)"
              width={120}
              height={32}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
