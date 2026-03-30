"use client"

import { useMemo, useRef, useCallback } from "react"

import { ChartShell } from "@/components/charts/ChartShell"
import { useChartExport } from "@/hooks/useChartExport"
import { useToast } from "@/components/ui/use-toast"
import { formatCurrencyAUD } from "@/lib/charts/format"
import { chartThresholdForUtilisation } from "@/lib/charts/theme"
import { useResponsiveChartHeight } from "@/lib/charts/responsive"
import { cn } from "@/lib/utils"

export type ProgressBarProps = {
  value: number
  max: number
  label: string
  formatValue?: (value: number) => string
  showLabel?: boolean
  size?: "sm" | "md" | "lg"
  description?: string
  className?: string
  chartAreaClassName?: string
}

const SIZE_CLASS = {
  sm: "h-1.5 text-xs",
  md: "h-2.5 text-sm",
  lg: "h-4 text-base",
} as const

export function ProgressBar({
  value,
  max,
  label,
  formatValue = formatCurrencyAUD,
  showLabel = true,
  size = "md",
  description,
  className,
  chartAreaClassName,
}: ProgressBarProps) {
  const chartAreaRef = useRef<HTMLDivElement | null>(null)
  const chartHeight = useResponsiveChartHeight(chartAreaRef)
  const { exportCsv } = useChartExport()
  const { toast } = useToast()

  const pct = useMemo(() => {
    const m = Number(max) || 1
    const v = Number(value) || 0
    return Math.min(100, Math.max(0, (v / m) * 100))
  }, [max, value])

  const barColor = chartThresholdForUtilisation(pct)

  const handleExportCsv = useCallback(() => {
    exportCsv(
      [{ label, value, max, percent: pct }],
      [
        { header: "Label", accessor: (r) => r.label },
        { header: "Value", accessor: (r) => r.value },
        { header: "Max", accessor: (r) => r.max },
        { header: "Percent", accessor: (r) => `${r.percent.toFixed(1)}%` },
      ],
      `${label.toLowerCase().replace(/\s+/g, "-")}-progress.csv`
    )
    toast({ title: "CSV exported", description: `${label} progress exported.` })
  }, [exportCsv, label, max, pct, toast, value])

  const ariaLabel = `${label}: ${pct.toFixed(0)} percent, ${formatValue(value)} of ${formatValue(max)}`

  return (
    <ChartShell
      title={label}
      description={description}
      className={className}
      chartAreaRef={chartAreaRef}
      chartAreaClassName={cn("flex min-h-0 flex-col justify-center", chartAreaClassName)}
      chartAreaStyle={{ minHeight: Math.min(chartHeight, 200), height: "auto" }}
      onExportCsv={handleExportCsv}
    >
      <div className="flex w-full flex-col gap-2 py-1">
        {showLabel ? (
          <div className="flex items-baseline justify-between gap-2 text-muted-foreground">
            <span className="text-sm font-medium text-foreground">{label}</span>
            <span className="text-sm tabular-nums">
              {formatValue(value)} / {formatValue(max)} ({pct.toFixed(0)}%)
            </span>
          </div>
        ) : null}
        <div
          className={cn(
            "w-full overflow-hidden rounded-full bg-muted",
            SIZE_CLASS[size]
          )}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label={ariaLabel}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{
              width: `${pct}%`,
              backgroundColor: barColor,
            }}
          />
        </div>
      </div>
    </ChartShell>
  )
}
