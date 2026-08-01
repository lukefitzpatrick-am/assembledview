"use client"

import { type ReactNode, type RefObject } from "react"

import {
  BaseChartCard,
  type ChartExportSeriesInput,
} from "@/components/charts/system"
import { cn } from "@/lib/utils"

export type SpendingInsightChartShellProps = {
  title: string
  description?: string
  children: ReactNode
  chartAreaRef?: RefObject<HTMLDivElement | null>
  chartAreaClassName?: string
  className?: string
  exportPage?: string
  exportSeries?: ChartExportSeriesInput
}

export function SpendingInsightChartShell({
  title,
  description,
  children,
  chartAreaRef,
  chartAreaClassName = "min-h-[320px]",
  className,
  exportPage = "dashboard",
  exportSeries,
}: SpendingInsightChartShellProps) {
  return (
    <BaseChartCard
      title={title}
      subtitle={description}
      className={cn("rounded-xl border-border shadow-none", className)}
      bodyRef={chartAreaRef}
      exportPage={exportPage}
      exportSeries={exportSeries}
    >
      <div className={chartAreaClassName}>{children}</div>
    </BaseChartCard>
  )
}
