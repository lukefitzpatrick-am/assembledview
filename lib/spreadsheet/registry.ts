import { serializeSpreadsheetCellKey } from "@/lib/spreadsheet/cellKey"
import type {
  SpreadsheetRegistryEntry,
  SpreadsheetRegistryTableSpec,
} from "@/lib/spreadsheet/types"

export type BuiltSpreadsheetRegistry = Readonly<{
  entries: readonly SpreadsheetRegistryEntry[]
  keyToIndex: ReadonlyMap<string, number>
  rowCount: number
  colCount: number
  monthYears: readonly string[]
  entryByRowCol: ReadonlyMap<string, SpreadsheetRegistryEntry>
}>

function rowColKey(rowIndex: number, colIndex: number): string {
  return `${rowIndex}:${colIndex}`
}

/**
 * Build a flat registry: one logical row per line-item/cost row; columns = months.
 * Only includes cells from expanded tables (D4).
 */
export function buildSpreadsheetRegistry(
  monthYears: readonly string[],
  tables: readonly SpreadsheetRegistryTableSpec[]
): BuiltSpreadsheetRegistry {
  const entries: SpreadsheetRegistryEntry[] = []
  const keyToIndex = new Map<string, number>()
  const entryByRowCol = new Map<string, SpreadsheetRegistryEntry>()
  const colCount = monthYears.length

  let globalRowIndex = 0
  for (const table of tables) {
    if (!table.expanded) continue
    for (const row of table.rows) {
      monthYears.forEach((monthYear, colIndex) => {
        const key = {
          tableKey: table.tableKey,
          rowKind: row.rowKind,
          rowId: row.rowId,
          monthYear,
        }
        const serialized = serializeSpreadsheetCellKey(key)
        const entry: SpreadsheetRegistryEntry = {
          ...key,
          rowIndex: globalRowIndex,
          colIndex,
        }
        keyToIndex.set(serialized, entries.length)
        entryByRowCol.set(rowColKey(globalRowIndex, colIndex), entry)
        entries.push(entry)
      })
      globalRowIndex++
    }
  }

  return {
    entries,
    keyToIndex,
    rowCount: globalRowIndex,
    colCount,
    monthYears,
    entryByRowCol,
  }
}

export function registryEntryAt(
  registry: BuiltSpreadsheetRegistry,
  rowIndex: number,
  colIndex: number
): SpreadsheetRegistryEntry | null {
  return registry.entryByRowCol.get(rowColKey(rowIndex, colIndex)) ?? null
}
