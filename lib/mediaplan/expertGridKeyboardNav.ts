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
  colIndex: number,
  /**
   * Optional hook for virtualized grids (F-28 Phase 2). Called before focusing so
   * the target row can be scrolled into the rendered window. If the cell is not
   * yet mounted, the focus is retried on the next animation frame. Non-virtualized
   * callers omit this and behaviour is unchanged.
   */
  ensureVisible?: (rowIndex: number) => void
): boolean {
  if (ensureVisible) ensureVisible(rowIndex)

  const id = expertGridCellId(gridId, rowIndex, colIndex)
  const focusById = (): boolean => {
    const el = document.getElementById(id)
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

  if (focusById()) return true

  // Row was likely just scrolled into a virtual window and hasn't mounted yet.
  if (ensureVisible && typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      focusById()
    })
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
  /** Optional scroll-into-view hook for virtualized grids (see focusExpertGridCell). */
  ensureVisible?: (rowIndex: number) => void
}

/**
 * Spreadsheet-style navigation among grid inputs. Tab is left to the browser.
 * ArrowLeft/Right only move when the caret is at the start/end (skipped for type="date").
 */
export function handleExpertGridInputKeyDown(
  args: ExpertGridInputKeyDownArgs
): void {
  const { gridId, rowIndex, colIndex, rowCount, colCount, event, ensureVisible } =
    args
  const { key, currentTarget: t } = event

  if (rowCount < 1 || colCount < 1) return

  if (key === "Enter") {
    event.preventDefault()
    const nextRow = Math.min(rowIndex + 1, rowCount - 1)
    focusExpertGridCell(gridId, nextRow, colIndex, ensureVisible)
    return
  }

  if (key === "ArrowDown") {
    event.preventDefault()
    const nextRow = Math.min(rowIndex + 1, rowCount - 1)
    focusExpertGridCell(gridId, nextRow, colIndex, ensureVisible)
    return
  }

  if (key === "ArrowUp") {
    event.preventDefault()
    const nextRow = Math.max(rowIndex - 1, 0)
    focusExpertGridCell(gridId, nextRow, colIndex, ensureVisible)
    return
  }

  const isDate = t.type === "date"

  if (key === "ArrowLeft" && !isDate) {
    const start = t.selectionStart ?? 0
    const end = t.selectionEnd ?? 0
    if (start === 0 && end === 0) {
      event.preventDefault()
      const nc = Math.max(colIndex - 1, 0)
      focusExpertGridCell(gridId, rowIndex, nc, ensureVisible)
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
      focusExpertGridCell(gridId, rowIndex, nc, ensureVisible)
    }
  }
}
