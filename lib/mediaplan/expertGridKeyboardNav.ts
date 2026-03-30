import type { KeyboardEvent } from "react"

export function expertGridCellId(
  gridId: string,
  rowIndex: number,
  colIndex: number
): string {
  return `${gridId}-r${rowIndex}-c${colIndex}`
}

export function focusExpertGridCell(
  gridId: string,
  rowIndex: number,
  colIndex: number
): boolean {
  const el = document.getElementById(
    expertGridCellId(gridId, rowIndex, colIndex)
  )
  if (!el) return false
  if (el instanceof HTMLInputElement) {
    el.focus()
    try {
      el.select()
    } catch {
      /* date inputs may not support select */
    }
    return true
  }
  if (el instanceof HTMLButtonElement) {
    el.focus()
    return true
  }
  return false
}

export interface ExpertGridInputKeyDownArgs {
  gridId: string
  rowIndex: number
  colIndex: number
  rowCount: number
  colCount: number
  event: KeyboardEvent<HTMLInputElement>
}

/**
 * Spreadsheet-style navigation among grid inputs. Tab is left to the browser.
 * ArrowLeft/Right only move when the caret is at the start/end (skipped for type="date").
 */
export function handleExpertGridInputKeyDown(
  args: ExpertGridInputKeyDownArgs
): void {
  const { gridId, rowIndex, colIndex, rowCount, colCount, event } = args
  const { key, currentTarget: t } = event

  if (rowCount < 1 || colCount < 1) return

  if (key === "Enter") {
    event.preventDefault()
    const nextRow = Math.min(rowIndex + 1, rowCount - 1)
    focusExpertGridCell(gridId, nextRow, colIndex)
    return
  }

  if (key === "ArrowDown") {
    event.preventDefault()
    const nextRow = Math.min(rowIndex + 1, rowCount - 1)
    focusExpertGridCell(gridId, nextRow, colIndex)
    return
  }

  if (key === "ArrowUp") {
    event.preventDefault()
    const nextRow = Math.max(rowIndex - 1, 0)
    focusExpertGridCell(gridId, nextRow, colIndex)
    return
  }

  const isDate = t.type === "date"

  if (key === "ArrowLeft" && !isDate) {
    const start = t.selectionStart ?? 0
    const end = t.selectionEnd ?? 0
    if (start === 0 && end === 0) {
      event.preventDefault()
      const nc = Math.max(colIndex - 1, 0)
      focusExpertGridCell(gridId, rowIndex, nc)
    }
    return
  }

  if (key === "ArrowRight" && !isDate) {
    const len = t.value.length
    const start = t.selectionStart ?? 0
    const end = t.selectionEnd ?? 0
    if (start === len && end === len) {
      event.preventDefault()
      const nc = Math.min(colIndex + 1, colCount - 1)
      focusExpertGridCell(gridId, rowIndex, nc)
    }
  }
}
