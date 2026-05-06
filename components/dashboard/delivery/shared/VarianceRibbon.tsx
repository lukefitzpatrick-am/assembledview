import { TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

export interface VarianceRibbonProps {
  /** Variance as a decimal. e.g. -0.3923 means -39.23%. */
  variance: number
  /** Compared-to label, e.g. "vs 100% expected delivery". */
  label?: string
  className?: string
}

function formatVariance(v: number): string {
  const pct = v * 100
  const sign = pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(2)}%`
}

export function VarianceRibbon({ variance, label, className }: VarianceRibbonProps) {
  const positive = variance >= 0
  const Icon = positive ? TrendingUp : TrendingDown
  const tone = positive
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-rose-700 dark:text-rose-400"
  return (
    <div className={cn("flex items-center justify-between text-xs", className)}>
      {label ? <span className="text-muted-foreground">{label}</span> : <span />}
      <span className={cn("inline-flex items-center gap-1 font-medium tabular-nums", tone)}>
        <Icon className="h-3 w-3" aria-hidden />
        {formatVariance(variance)}
      </span>
    </div>
  )
}
