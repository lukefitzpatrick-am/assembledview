import type { SpreadsheetCellKey } from "@/lib/spreadsheet/types"

const SEP = "\u001f"

export function serializeSpreadsheetCellKey(key: SpreadsheetCellKey): string {
  return `${key.tableKey}${SEP}${key.rowKind}${SEP}${key.rowId}${SEP}${key.monthYear}`
}

export function parseSpreadsheetCellKey(serialized: string): SpreadsheetCellKey | null {
  const parts = serialized.split(SEP)
  if (parts.length !== 4) return null
  const [tableKey, rowKind, rowId, monthYear] = parts
  if (rowKind !== "lineItem" && rowKind !== "cost") return null
  if (!tableKey || !rowId || !monthYear) return null
  return { tableKey, rowKind, rowId, monthYear }
}

export function spreadsheetCellDomId(serializedKey: string): string {
  return `billing-cell-${serializedKey.replace(/[^\w-]/g, "_")}`
}
