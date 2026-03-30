"use client"

import { useCallback, useState, type RefObject } from "react"
import html2canvas from "html2canvas"
import { saveAs } from "file-saver"

type ExportColumn<T> = {
  header: string
  accessor: keyof T | ((row: T) => unknown)
  formatter?: (value: unknown, row: T) => string
}

type ExportPngFn = (
  ref: RefObject<HTMLElement | null>,
  filename?: string
) => Promise<void>

type ExportCsvFn = <T>(
  data: T[],
  columns: ExportColumn<T>[],
  filename?: string
) => void

type UseChartExportResult = {
  exportPng: ExportPngFn
  exportCsv: ExportCsvFn
  isExporting: boolean
  exportError: string | null
}

const DEFAULT_PNG_FILENAME = "chart-export.png"
const DEFAULT_CSV_FILENAME = "chart-data.csv"

const toFilename = (filename: string | undefined, extension: "png" | "csv"): string => {
  const baseName =
    filename && filename.trim().length > 0
      ? filename.trim()
      : extension === "png"
        ? DEFAULT_PNG_FILENAME
        : DEFAULT_CSV_FILENAME

  return baseName.toLowerCase().endsWith(`.${extension}`)
    ? baseName
    : `${baseName}.${extension}`
}

const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return ""
  }

  const cell = String(value)
  if (cell.includes('"') || cell.includes(",") || cell.includes("\n") || cell.includes("\r")) {
    return `"${cell.replace(/"/g, '""')}"`
  }

  return cell
}

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create PNG file."))
        return
      }
      resolve(blob)
    }, "image/png")
  })

export function useChartExport(): UseChartExportResult {
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const exportPng = useCallback<ExportPngFn>(async (ref, filename) => {
    if (!ref.current) {
      setExportError("Could not export chart: no element was found.")
      return
    }

    setExportError(null)
    setIsExporting(true)

    try {
      const canvas = await html2canvas(ref.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      })
      const blob = await canvasToBlob(canvas)
      saveAs(blob, toFilename(filename, "png"))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred while exporting PNG."
      setExportError(message)
    } finally {
      setIsExporting(false)
    }
  }, [])

  const exportCsv = useCallback<ExportCsvFn>((data, columns, filename) => {
    setExportError(null)

    try {
      const headerRow = columns.map((column) => escapeCsvCell(column.header)).join(",")

      const rows = data.map((row) =>
        columns
          .map((column) => {
            const rawValue =
              typeof column.accessor === "function"
                ? column.accessor(row)
                : (row[column.accessor] as unknown)

            const formattedValue = column.formatter
              ? column.formatter(rawValue, row)
              : rawValue

            return escapeCsvCell(formattedValue)
          })
          .join(",")
      )

      const csvContent = [headerRow, ...rows].join("\r\n")
      const csvBlob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" })
      saveAs(csvBlob, toFilename(filename, "csv"))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred while exporting CSV."
      setExportError(message)
    }
  }, [])

  return {
    exportPng,
    exportCsv,
    isExporting,
    exportError,
  }
}
