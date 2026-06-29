import { serializeSpreadsheetCellKey, spreadsheetCellDomId } from "@/lib/spreadsheet/cellKey"
import type { BuiltSpreadsheetRegistry } from "@/lib/spreadsheet/registry"
import { registryEntryAt } from "@/lib/spreadsheet/registry"

function focusSpreadsheetCell(serializedKey: string): boolean {
  const el = document.getElementById(spreadsheetCellDomId(serializedKey))
  if (!el) return false
  if (el instanceof HTMLInputElement) {
    el.focus()
    try {
      el.select()
    } catch {
      /* ignore */
    }
    return true
  }
  return false
}

function focusSpreadsheetCellAt(
  registry: BuiltSpreadsheetRegistry,
  rowIndex: number,
  colIndex: number
): boolean {
  const entry = registryEntryAt(registry, rowIndex, colIndex)
  if (!entry) return false
  return focusSpreadsheetCell(serializeSpreadsheetCellKey(entry))
}

export interface SpreadsheetInputKeyDownArgs {
  registry: BuiltSpreadsheetRegistry
  serializedKey: string
  rowIndex: number
  colIndex: number
  event: React.KeyboardEvent<HTMLInputElement>
}

/** Spreadsheet-style navigation among billing month inputs. */
export function handleSpreadsheetInputKeyDown(args: SpreadsheetInputKeyDownArgs): void {
  const { registry, serializedKey, rowIndex, colIndex, event } = args
  const { key, currentTarget: t } = event
  const { rowCount, colCount } = registry

  if (rowCount < 1 || colCount < 1) return

  if (key === "Enter") {
    event.preventDefault()
    const nextRow = Math.min(rowIndex + 1, rowCount - 1)
    focusSpreadsheetCellAt(registry, nextRow, colIndex)
    return
  }

  if (key === "ArrowDown") {
    event.preventDefault()
    focusSpreadsheetCellAt(registry, Math.min(rowIndex + 1, rowCount - 1), colIndex)
    return
  }

  if (key === "ArrowUp") {
    event.preventDefault()
    focusSpreadsheetCellAt(registry, Math.max(rowIndex - 1, 0), colIndex)
    return
  }

  if (key === "ArrowLeft") {
    const start = t.selectionStart ?? 0
    const end = t.selectionEnd ?? 0
    if (start === 0 && end === 0) {
      event.preventDefault()
      focusSpreadsheetCellAt(registry, rowIndex, Math.max(colIndex - 1, 0))
    }
    return
  }

  if (key === "ArrowRight") {
    const len = t.value.length
    const start = t.selectionStart ?? 0
    const end = t.selectionEnd ?? 0
    if (start === len && end === len) {
      event.preventDefault()
      focusSpreadsheetCellAt(registry, rowIndex, Math.min(colIndex + 1, colCount - 1))
    }
  }
}
