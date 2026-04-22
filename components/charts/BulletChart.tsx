"use client"

import { useMemo, useRef, useCallback } from "react"

import { ChartShell } from "@/components/charts/ChartShell"
import { useChartExport } from "@/hooks/useChartExport"
import { useToast } from "@/components/ui/use-toast"
import { formatCurrencyAUD } from "@/lib/format/currency"
import { CHART_GAUGE } from "@/lib/charts/theme"
import { useResponsiveChartHeight } from "@/lib/charts/responsive"
import { cn } from "@/lib/utils"

export type BulletChartProps = {
  title: string
  description?: string
  actual: number
  target: number
  /** Upper bounds of poor, satisfactory, and good bands (ascending). */
  ranges: [poor: number, ok: number, good: number]
  formatValue?: (value: number) => string
  unit?: string
  className?: string
  chartAreaClassName?: string
}

export function BulletChart({
  title,
  description,
  actual,
  target,
  ranges,
  formatValue = formatCurrencyAUD,
  unit = "",
  className,
  chartAreaClassName,
}: BulletChartProps) {
  const chartAreaRef = useRef<HTMLDivElement | null>(null)
  const chartHeight = useResponsiveChartHeight(chartAreaRef)
  const { exportCsv } = useChartExport()
  const { toast } = useToast()

  const [poor, ok, good] = ranges

  const maxScale = useMemo(
    () => Math.max(good, target, actual, 1) * 1.08,
    [good, target, actual]
  )

  const bands = useMemo(() => {
    const pct = (v: number) => Math.min(100, Math.max(0, (v / maxScale) * 100))
    const wPoor = pct(poor)
    const wOk = pct(ok) - wPoor
    const wGood = pct(good) - pct(ok)
    const wTail = Math.max(0, 100 - pct(good))
    return { wPoor, wOk, wGood, wTail }
  }, [good, maxScale, ok, poor])

  const actualPct = Math.min(100, (actual / maxScale) * 100)
  const targetPct = Math.min(100, (target / maxScale) * 100)

  const handleExportCsv = useCallback(() => {
    exportCsv(
      [{ actual, target, poor, ok, good, unit }],
      [
        { header: "Actual", accessor: (r) => r.actual },
        { header: "Target", accessor: (r) => r.target },
        { header: "Range poor", accessor: (r) => r.poor },
        { header: "Range ok", accessor: (r) => r.ok },
        { header: "Range good", accessor: (r) => r.good },
        { header: "Unit", accessor: (r) => r.unit },
      ],
      `${title.toLowerCase().replace(/\s+/g, "-")}-bullet.csv`
    )
    toast({ title: "CSV exported", description: `${title} data has been downloaded.` })
  }, [actual, exportCsv, good, ok, poor, target, title, toast, unit])

  const ariaLabel = `${title}: bullet chart. Actual ${formatValue(actual)}${unit ? ` ${unit}` : ""}, target ${formatValue(target)}`

  return (
    <ChartShell
      title={title}
      description={description}
      className={className}
      chartAreaRef={chartAreaRef}
      chartAreaClassName={cn("flex min-h-0 flex-col justify-center", chartAreaClassName)}
      chartAreaStyle={{ minHeight: chartHeight, height: "auto" }}
      onExportCsv={handleExportCsv}
    >
      <div
        className="flex w-full flex-col gap-2 py-2"
        role="img"
        aria-label={ariaLabel}
      >
        <div className="relative h-10 w-full rounded-full bg-muted/40">
          <div
            className="absolute inset-y-1 left-1 flex overflow-hidden rounded-full"
            style={{ width: "calc(100% - 8px)" }}
          >
            <div
              className="h-full"
              style={{
                width: `${bands.wPoor}%`,
                backgroundColor: CHART_GAUGE.behind.fill,
              }}
              aria-hidden
            />
            <div
              className="h-full"
              style={{
                width: `${bands.wOk}%`,
                backgroundColor: CHART_GAUGE.atRisk.fill,
              }}
              aria-hidden
            />
            <div
              className="h-full"
              style={{
                width: `${bands.wGood}%`,
                backgroundColor: CHART_GAUGE.onTrack.fill,
              }}
              aria-hidden
            />
            {bands.wTail > 0 ? (
              <div
                className="h-full flex-1 bg-muted/30"
                aria-hidden
              />
            ) : null}
          </div>
          <div
            className="absolute inset-y-2 rounded-sm bg-primary shadow-sm"
            style={{
              left: "4px",
              width: `calc((100% - 8px) * ${actualPct} / 100)`,
              maxWidth: "calc(100% - 8px)",
            }}
            aria-hidden
          />
          <div
            className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-foreground shadow"
            style={{ left: `calc(4px + (100% - 8px) * ${targetPct} / 100)` }}
            title={`Target ${formatValue(target)}`}
            aria-label={`Target ${formatValue(target)}`}
          />
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Actual:{" "}
            <span className="font-medium text-foreground">
              {formatValue(actual)}
              {unit ? ` ${unit}` : ""}
            </span>
          </span>
          <span>
            Target:{" "}
            <span className="font-medium text-foreground">
              {formatValue(target)}
              {unit ? ` ${unit}` : ""}
            </span>
          </span>
        </div>
      </div>
    </ChartShell>
  )
}
