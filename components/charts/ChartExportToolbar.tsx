"use client"

import { useEffect, type RefObject } from "react"
import { FileSpreadsheet, ImageDown, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { useChartExport } from "@/hooks/useChartExport"
import { cn } from "@/lib/utils"

function exportBasenameFromTitle(title: string): string {
  const s = title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
  return s.length > 0 ? s : "chart"
}

export type ChartExportToolbarProps = {
  title: string
  chartAreaRef: RefObject<HTMLElement | null>
  onExportCsv?: () => void
  onExportPng?: () => void
  /** Notifies parent when PNG export starts/finishes (e.g. ChartShell loading overlay). */
  onIsExportingChange?: (isExporting: boolean) => void
  onExportErrorChange?: (error: string | null) => void
  showExport?: boolean
  className?: string
}

export function ChartExportToolbar({
  title,
  chartAreaRef,
  onExportCsv,
  onExportPng,
  onIsExportingChange,
  onExportErrorChange,
  showExport = true,
  className,
}: ChartExportToolbarProps) {
  const { exportPng, isExporting, exportError } = useChartExport()
  const { toast } = useToast()

  useEffect(() => {
    onIsExportingChange?.(isExporting)
  }, [isExporting, onIsExportingChange])

  useEffect(() => {
    onExportErrorChange?.(exportError)
  }, [exportError, onExportErrorChange])

  if (!showExport) {
    return null
  }

  const handleCsvExport = () => {
    if (!onExportCsv) {
      toast({
        title: "CSV export unavailable",
        description: "Provide an onExportCsv handler to export this chart as CSV.",
      })
      return
    }
    onExportCsv()
  }

  const handlePngExport = async () => {
    const baseName = exportBasenameFromTitle(title)
    await exportPng(chartAreaRef, `${baseName}.png`)
    toast({
      title: "PNG exported",
      description: `${title} image has been downloaded.`,
    })
    onExportPng?.()
  }

  const csvDisabled = !onExportCsv || isExporting

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border border-input bg-background p-0.5 print:hidden",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2.5"
        onClick={handleCsvExport}
        disabled={csvDisabled}
      >
        <FileSpreadsheet className="h-4 w-4" />
        CSV
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2.5"
        onClick={handlePngExport}
        disabled={isExporting}
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImageDown className="h-4 w-4" />
        )}
        PNG
      </Button>
    </div>
  )
}
