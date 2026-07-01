"use client"

import { type ReactNode, type RefObject } from "react"

import { BaseChartCard, ChartExportToolbar } from "@/components/charts/system"
import { useChartExport } from "@/hooks/useChartExport"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

export type SpendingInsightCsvColumn<T> = {
  header: string
  accessor: keyof T | ((row: T) => unknown)
  formatter?: (value: unknown, row: T) => string
}

export type SpendingInsightChartShellProps<T> = {
  title: string
  description?: string
  children: ReactNode
  chartAreaRef?: RefObject<HTMLDivElement | null>
  chartAreaClassName?: string
  className?: string
  csvRows?: T[]
  csvColumns?: SpendingInsightCsvColumn<T>[]
  csvFilename?: string
}

export function SpendingInsightChartShell<T>({
  title,
  description,
  children,
  chartAreaRef,
  chartAreaClassName = "min-h-[320px]",
  className,
  csvRows,
  csvColumns,
  csvFilename,
}: SpendingInsightChartShellProps<T>) {
  const { exportCsv } = useChartExport()
  const { toast } = useToast()

  const handleExportCsv = () => {
    if (!csvRows?.length || !csvColumns?.length) {
      toast({
        title: "CSV export unavailable",
        description: "No data available to export for this chart.",
        variant: "destructive",
      })
      return
    }
    const base =
      csvFilename ??
      title
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
    exportCsv(csvRows, csvColumns, `${base || "chart"}.csv`)
    toast({
      title: "CSV exported",
      description: `${title} data has been downloaded.`,
    })
  }

  return (
    <BaseChartCard
      title={title}
      subtitle={description}
      className={cn("rounded-xl border-border shadow-none", className)}
      bodyRef={chartAreaRef}
      toolbar={
        csvRows?.length && csvColumns?.length ? (
          <ChartExportToolbar onCsv={handleExportCsv} />
        ) : undefined
      }
    >
      <div className={chartAreaClassName}>{children}</div>
    </BaseChartCard>
  )
}
