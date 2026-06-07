"use client"

import { useCallback, useRef } from "react"
import type { KeyboardEvent } from "react"

import { serializeSpreadsheetCellKey } from "@/lib/spreadsheet/cellKey"
import {
  clipboardMatrixFromDataTransfer,
  readClipboardMatrixAsync,
  trimEmptyEdgeColumns,
} from "@/lib/spreadsheet/matrixPaste"
import type { BuiltSpreadsheetRegistry } from "@/lib/spreadsheet/registry"
import { registryEntryAt } from "@/lib/spreadsheet/registry"
import {
  buildExportTsvFromRect,
  buildExportTsvFromStrip,
  buildPasteTargetsAnchorOnly,
  enumeratePasteTargets,
  mapClipboardMatrixToTargets,
  rectToMultiCellSelection,
  resolveExportSelection,
} from "@/lib/spreadsheet/selection"
import type {
  SpreadsheetCopiedCells,
  SpreadsheetMultiCellSelection,
  SpreadsheetPasteLayoutMode,
  SpreadsheetRectSelection,
} from "@/lib/spreadsheet/types"

export type SpreadsheetValueCallbacks = Readonly<{
  getCopyText: (serializedKey: string) => string
  getNumericValue: (serializedKey: string) => number
  setValueFromPaste: (serializedKey: string, raw: string) => void
  clearValue: (serializedKey: string) => void
}>

export type UseSpreadsheetClipboardArgs = Readonly<{
  registry: BuiltSpreadsheetRegistry
  getFocused: () => { serializedKey: string; rowIndex: number; colIndex: number } | null
  getRectSelection: () => SpreadsheetRectSelection | null
  getStripSelection: () => { rowIndex: number } | null
  getMultiSelect: () => { rowIndex: number; cols: number[] } | null
  getMultiCellSelection: () => Set<string> | null
  onBlockedCopyPaste?: (kind: "copy" | "paste") => void
  setCopiedCells: (v: SpreadsheetCopiedCells | null) => void
  callbacks: SpreadsheetValueCallbacks
  onPasteLayout?: (layout: SpreadsheetPasteLayoutMode) => void
}>

function parseClipboardToMatrix(text: string): string[][] {
  if (!text || text.trim() === "") return []
  return text
    .split(/\r?\n/)
    .filter((row) => row.length > 0)
    .map((row) => row.split("\t"))
}

export function useSpreadsheetClipboard(args: UseSpreadsheetClipboardArgs) {
  const suppressNextPasteApplyRef = useRef(false)
  const argsRef = useRef(args)
  argsRef.current = args

  const serializeEntry = useCallback((entry: { tableKey: string; rowKind: "lineItem" | "cost"; rowId: string; monthYear: string }) => {
    return serializeSpreadsheetCellKey(entry)
  }, [])

  const applyPasteMatrix = useCallback((matrix: string[][]) => {
    const {
      registry,
      getFocused,
      getRectSelection,
      getStripSelection,
      getMultiSelect,
      getMultiCellSelection,
      callbacks,
      onPasteLayout,
      onBlockedCopyPaste,
    } = argsRef.current

    let working = trimEmptyEdgeColumns(matrix)
    if (working.length === 0) return

    const focused = getFocused()
    if (!focused) return

    const multiKeys = getMultiCellSelection()
    if (multiKeys && multiKeys.size >= 2) {
      const isSingleValue =
        working.length === 1 && (working[0]?.length ?? 0) === 1
      if (!isSingleValue) {
        onBlockedCopyPaste?.("paste")
        return
      }
      const raw = working[0]?.[0] ?? ""
      const validKeys = new Set(
        registry.entries.map((e) => serializeSpreadsheetCellKey(e))
      )
      for (const k of multiKeys) {
        if (validKeys.has(k)) callbacks.setValueFromPaste(k, raw)
      }
      onPasteLayout?.("direct")
      return
    }

    const enumerated = enumeratePasteTargets(
      focused.rowIndex,
      focused.colIndex,
      getRectSelection(),
      getStripSelection(),
      getMultiSelect(),
      registry.entries,
      registry.colCount,
      (e) => serializeSpreadsheetCellKey(e)
    )

    let layout: SpreadsheetPasteLayoutMode = "direct"

    if (enumerated && enumerated.targets.length > 0) {
      const { originRow, originCol } = enumerated
      const mapped = mapClipboardMatrixToTargets(
        working,
        originRow,
        originCol,
        enumerated.targets
      )
      layout = mapped.layout
      for (const a of mapped.assignments) {
        const e = registryEntryAt(registry, a.rowIndex, a.colIndex)
        if (e) callbacks.setValueFromPaste(serializeSpreadsheetCellKey(e), a.raw ?? "")
      }
    } else {
      const anchorTargets = buildPasteTargetsAnchorOnly(
        working,
        focused.rowIndex,
        focused.colIndex,
        registry.rowCount,
        registry.colCount,
        (r, c) => registryEntryAt(registry, r, c),
        serializeEntry
      )
      for (const t of anchorTargets) {
        callbacks.setValueFromPaste(t.key, t.raw ?? "")
      }
      layout = "direct"
    }

    onPasteLayout?.(layout)
  }, [serializeEntry])

  const copySelection = useCallback(async (): Promise<boolean> => {
    const {
      registry,
      getFocused,
      getRectSelection,
      getStripSelection,
      getMultiCellSelection,
      callbacks,
      setCopiedCells,
      onBlockedCopyPaste,
    } = argsRef.current

    const multi = getMultiCellSelection()
    if (multi && multi.size >= 2) {
      onBlockedCopyPaste?.("copy")
      return false
    }

    const focused = getFocused()
    const sel = resolveExportSelection(
      getRectSelection(),
      getStripSelection(),
      focused?.rowIndex ?? null,
      focused?.colIndex ?? null
    )
    if (!sel) return false

    let text: string | null = null
    let bounds: SpreadsheetMultiCellSelection | null = null

    if (sel.kind === "rect") {
      text = buildExportTsvFromRect(registry.entries, sel.rect, (e) =>
        callbacks.getCopyText(serializeSpreadsheetCellKey(e))
      )
      bounds = rectToMultiCellSelection(sel.rect)
    } else if (sel.kind === "strip") {
      text = buildExportTsvFromStrip(registry.entries, sel.rowIndex, (e) =>
        callbacks.getCopyText(serializeSpreadsheetCellKey(e))
      )
      if (registry.colCount > 0) {
        bounds = {
          startRow: sel.rowIndex,
          endRow: sel.rowIndex,
          startCol: 0,
          endCol: registry.colCount - 1,
        }
      }
    } else {
      const e = registryEntryAt(registry, sel.rowIndex, sel.colIndex)
      if (!e) return false
      text = callbacks.getCopyText(serializeSpreadsheetCellKey(e))
      bounds = {
        startRow: sel.rowIndex,
        endRow: sel.rowIndex,
        startCol: sel.colIndex,
        endCol: sel.colIndex,
      }
    }

    if (!text) return false

    try {
      await navigator.clipboard.writeText(text)
      if (bounds) {
        const matrix = text.split("\n").map((line) => line.split("\t"))
        setCopiedCells({
          data: matrix,
          sourceRows: bounds.endRow - bounds.startRow + 1,
          sourceCols: bounds.endCol - bounds.startCol + 1,
          selection: bounds,
        })
      }
      return true
    } catch {
      return false
    }
  }, [])

  const cutSelection = useCallback(async (): Promise<boolean> => {
    const ok = await copySelection()
    if (!ok) return false

    const {
      registry,
      getFocused,
      getRectSelection,
      getStripSelection,
      callbacks,
    } = argsRef.current

    const focused = getFocused()
    const sel = resolveExportSelection(
      getRectSelection(),
      getStripSelection(),
      focused?.rowIndex ?? null,
      focused?.colIndex ?? null
    )
    if (!sel) return true

    if (sel.kind === "rect") {
      for (const e of registry.entries) {
        if (
          e.rowIndex >= sel.rect.rowStart &&
          e.rowIndex <= sel.rect.rowEnd &&
          e.colIndex >= sel.rect.colStart &&
          e.colIndex <= sel.rect.colEnd
        ) {
          callbacks.clearValue(serializeSpreadsheetCellKey(e))
        }
      }
    } else if (sel.kind === "strip") {
      for (const e of registry.entries) {
        if (e.rowIndex === sel.rowIndex) {
          callbacks.clearValue(serializeSpreadsheetCellKey(e))
        }
      }
    } else if (focused) {
      callbacks.clearValue(focused.serializedKey)
    }

    return true
  }, [copySelection])

  const handlePasteCapture = useCallback(
    (e: React.ClipboardEvent) => {
      if (suppressNextPasteApplyRef.current) {
        suppressNextPasteApplyRef.current = false
        e.preventDefault()
        e.stopPropagation()
        return
      }
      e.preventDefault()
      e.stopPropagation()

      const plainText = e.clipboardData.getData("text/plain")
      const plainMatrix = parseClipboardToMatrix(plainText)
      let matrix =
        plainMatrix.length > 0
          ? plainMatrix
          : clipboardMatrixFromDataTransfer(e.clipboardData)
      if (!matrix || matrix.length === 0) return
      applyPasteMatrix(matrix)
    },
    [applyPasteMatrix]
  )

  const handleGridKeyDownCapture = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      if (key === "c") {
        e.preventDefault()
        e.stopPropagation()
        void copySelection()
        return
      }

      if (key === "x") {
        e.preventDefault()
        e.stopPropagation()
        void cutSelection()
        return
      }

      if (key === "v") {
        e.preventDefault()
        e.stopPropagation()
        suppressNextPasteApplyRef.current = true
        window.setTimeout(() => {
          if (suppressNextPasteApplyRef.current) {
            suppressNextPasteApplyRef.current = false
          }
        }, 0)
        void (async () => {
          let matrix = await readClipboardMatrixAsync()
          if (!matrix?.length) return
          matrix = trimEmptyEdgeColumns(matrix)
          if (!matrix.length) return
          applyPasteMatrix(matrix)
        })()
      }
    },
    [applyPasteMatrix, copySelection, cutSelection]
  )

  return {
    suppressNextPasteApplyRef,
    applyPasteMatrix,
    copySelection,
    cutSelection,
    handlePasteCapture,
    handleGridKeyDownCapture,
  }
}
