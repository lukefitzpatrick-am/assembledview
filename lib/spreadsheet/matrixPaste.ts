/** Re-exports for spreadsheet consumers; expert grids keep importing from expertGridPaste. */
export {
  splitClipboardMatrix,
  normalizePastedNumericRaw,
  parseNumericPasteString,
  readClipboardMatrixAsync,
  trimEmptyEdgeColumns,
  clipboardMatrixFromDataTransfer,
  clipboardMatrixFromStrings,
  matrixFromHtmlTable,
} from "@/lib/mediaplan/expertGridPaste"

export type { PasteCellResult } from "@/lib/mediaplan/expertGridPaste"
