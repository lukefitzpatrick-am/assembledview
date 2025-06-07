"use client"

import { ReactNode } from "react"
import { CSVExportButton } from "@/components/ui/csv-export-button"

interface TableWithExportProps<T> {
  data: T[]
  filename: string
  headers?: Record<string, string>
  children: ReactNode
  className?: string
  exportButtonClassName?: string
  exportButtonText?: string
  showExportButton?: boolean
}

export function TableWithExport<T extends Record<string, any>>({
  data,
  filename,
  headers,
  children,
  className = "",
  exportButtonClassName = "",
  exportButtonText = "Export CSV",
  showExportButton = true
}: TableWithExportProps<T>) {
  return (
    <div className={`space-y-4 ${className}`}>
      {showExportButton && (
        <div className="flex justify-end">
          <CSVExportButton
            data={data}
            filename={filename}
            headers={headers}
            className={exportButtonClassName}
            buttonText={exportButtonText}
          />
        </div>
      )}
      {children}
    </div>
  )
} 