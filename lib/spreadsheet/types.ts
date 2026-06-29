/** Stable identity for one editable manual-billing month cell (D1). */
export type SpreadsheetCellKey = Readonly<{
  tableKey: string
  rowKind: "lineItem" | "cost"
  rowId: string
  monthYear: string
}>

export type SpreadsheetRegistryEntry = SpreadsheetCellKey &
  Readonly<{
    rowIndex: number
    colIndex: number
  }>

export type SpreadsheetRectSelection = Readonly<{
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}>

export type SpreadsheetMultiCellSelection = Readonly<{
  startRow: number
  endRow: number
  startCol: number
  endCol: number
}>

export type SpreadsheetPasteLayoutMode = "tile" | "clip" | "direct"

export type SpreadsheetCopiedCells = Readonly<{
  data: string[][]
  sourceRows: number
  sourceCols: number
  selection: SpreadsheetMultiCellSelection
}>

type SpreadsheetRegistryTableRow = Readonly<{
  rowKind: "lineItem" | "cost"
  rowId: string
}>

export type SpreadsheetRegistryTableSpec = Readonly<{
  tableKey: string
  expanded: boolean
  rows: readonly SpreadsheetRegistryTableRow[]
}>
