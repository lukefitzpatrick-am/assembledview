"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { downloadCSV } from "@/lib/utils/csv-export"
import { useState } from "react"

interface CSVExportButtonProps<T> {
  data: T[]
  filename: string
  headers?: Record<string, string>
  className?: string
  disabled?: boolean
  buttonText?: string
}

export function CSVExportButton<T extends Record<string, any>>({
  data,
  filename,
  headers,
  className,
  disabled = false,
  buttonText = "Export CSV"
}: CSVExportButtonProps<T>) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = () => {
    if (data.length === 0) return
    
    setIsExporting(true)
    
    try {
      downloadCSV(data, filename, headers)
    } catch (error) {
      console.error("Error exporting CSV:", error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={handleExport}
      disabled={disabled || data.length === 0 || isExporting}
    >
      <Download className="mr-2 h-4 w-4" />
      {isExporting ? "Exporting..." : buttonText}
    </Button>
  )
} 