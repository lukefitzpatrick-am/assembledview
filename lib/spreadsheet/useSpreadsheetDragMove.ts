"use client"

import { useCallback, useRef, useState } from "react"

import { serializeSpreadsheetCellKey } from "@/lib/spreadsheet/cellKey"
import type { BuiltSpreadsheetRegistry } from "@/lib/spreadsheet/registry"
import { registryEntryAt } from "@/lib/spreadsheet/registry"
import { mapClipboardMatrixToTargets } from "@/lib/spreadsheet/selection"
import type { SpreadsheetRectSelection } from "@/lib/spreadsheet/types"

type MoveSourceBounds = Readonly<{
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}>

type DragKind = "move" | "fill"

type SpreadsheetDragMoveCallbacks = Readonly<{
  getNumericValue: (serializedKey: string) => number
  setValueFromPaste: (serializedKey: string, raw: string) => void
  clearValue: (serializedKey: string) => void
}>

export type UseSpreadsheetDragMoveArgs = Readonly<{
  registry: BuiltSpreadsheetRegistry
  getFocused: () => { serializedKey: string; rowIndex: number; colIndex: number } | null
  getRectSelection: () => SpreadsheetRectSelection | null
  getStripSelection: () => { rowIndex: number } | null
  getMultiCellSelection: () => Set<string> | null
  callbacks: SpreadsheetDragMoveCallbacks
  onInvalidDrop?: () => void
}>

function inclusiveRange(lo: number, hi: number): number[] {
  const out: number[] = []
  for (let i = lo; i <= hi; i++) out.push(i)
  return out
}

export function useSpreadsheetDragMove(args: UseSpreadsheetDragMoveArgs) {
  const argsRef = useRef(args)
  argsRef.current = args

  const dragSourceRef = useRef<MoveSourceBounds | null>(null)
  const dragKindRef = useRef<DragKind | null>(null)
  const [dropAnchor, setDropAnchor] = useState<{ rowIndex: number; colIndex: number } | null>(null)

  const resolveMoveBounds = useCallback((): MoveSourceBounds | null => {
    const { getFocused, getRectSelection, getStripSelection, getMultiCellSelection } = argsRef.current
    if (getMultiCellSelection()?.size) return null
    if (getStripSelection()) return null
    const rect = getRectSelection()
    if (rect) {
      return {
        rowStart: rect.rowStart,
        rowEnd: rect.rowEnd,
        colStart: rect.colStart,
        colEnd: rect.colEnd,
      }
    }
    const f = getFocused()
    if (f) {
      return { rowStart: f.rowIndex, rowEnd: f.rowIndex, colStart: f.colIndex, colEnd: f.colIndex }
    }
    return null
  }, [])

  const showMoveGrip = useCallback(
    (rowIndex: number, colIndex: number): boolean => {
      const f = argsRef.current.getFocused()
      if (!f || f.rowIndex !== rowIndex || f.colIndex !== colIndex) return false
      return resolveMoveBounds() !== null
    },
    [resolveMoveBounds]
  )

  const showFillHandle = useCallback(
    (rowIndex: number, colIndex: number): boolean => {
      const bounds = resolveMoveBounds()
      if (!bounds) return false
      return rowIndex === bounds.rowEnd && colIndex === bounds.colEnd
    },
    [resolveMoveBounds]
  )

  const beginDrag = useCallback(
    (kind: DragKind, e: React.DragEvent) => {
      const bounds = resolveMoveBounds()
      if (!bounds) {
        e.preventDefault()
        return
      }
      dragSourceRef.current = bounds
      dragKindRef.current = kind
      e.dataTransfer.effectAllowed = kind === "move" ? "move" : "copy"
      e.dataTransfer.setData("text/plain", kind === "move" ? "mb-move" : "mb-fill")
    },
    [resolveMoveBounds]
  )

  const onGripDragStart = useCallback((e: React.DragEvent) => beginDrag("move", e), [beginDrag])
  const onFillHandleDragStart = useCallback((e: React.DragEvent) => beginDrag("fill", e), [beginDrag])

  const endDrag = useCallback(() => {
    dragSourceRef.current = null
    dragKindRef.current = null
    setDropAnchor(null)
  }, [])

  const onCellDragOver = useCallback((rowIndex: number, colIndex: number, e: React.DragEvent) => {
    if (!dragSourceRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = dragKindRef.current === "fill" ? "copy" : "move"
    setDropAnchor((prev) =>
      prev && prev.rowIndex === rowIndex && prev.colIndex === colIndex ? prev : { rowIndex, colIndex }
    )
  }, [])

  const applyMove = useCallback((src: MoveSourceBounds, dropRow: number, dropCol: number) => {
    const { registry, callbacks, onInvalidDrop } = argsRef.current
    const dRow = dropRow - src.rowStart
    const dCol = dropCol - src.colStart
    if (dRow === 0 && dCol === 0) return

    const moves: { fromKey: string; toKey: string; raw: string }[] = []
    for (let r = src.rowStart; r <= src.rowEnd; r++) {
      for (let c = src.colStart; c <= src.colEnd; c++) {
        const fromEntry = registryEntryAt(registry, r, c)
        if (!fromEntry) continue
        const toEntry = registryEntryAt(registry, r + dRow, c + dCol)
        if (!toEntry) {
          onInvalidDrop?.()
          return
        }
        const fromKey = serializeSpreadsheetCellKey(fromEntry)
        const toKey = serializeSpreadsheetCellKey(toEntry)
        moves.push({ fromKey, toKey, raw: String(callbacks.getNumericValue(fromKey)) })
      }
    }
    if (moves.length === 0) return

    const targetKeys = new Set(moves.map((m) => m.toKey))
    for (const m of moves) callbacks.setValueFromPaste(m.toKey, m.raw)
    for (const m of moves) {
      if (!targetKeys.has(m.fromKey)) callbacks.clearValue(m.fromKey)
    }
  }, [])

  const applyFill = useCallback((src: MoveSourceBounds, dropRow: number, dropCol: number) => {
    const { registry, callbacks } = argsRef.current
    const rowBeyond =
      dropRow < src.rowStart ? dropRow - src.rowStart : dropRow > src.rowEnd ? dropRow - src.rowEnd : 0
    const colBeyond =
      dropCol < src.colStart ? dropCol - src.colStart : dropCol > src.colEnd ? dropCol - src.colEnd : 0
    if (rowBeyond === 0 && colBeyond === 0) return
    const vertical = Math.abs(rowBeyond) >= Math.abs(colBeyond)

    const sourceMatrix: string[][] = []
    for (let r = src.rowStart; r <= src.rowEnd; r++) {
      const row: string[] = []
      for (let c = src.colStart; c <= src.colEnd; c++) {
        const e2 = registryEntryAt(registry, r, c)
        row.push(e2 ? String(callbacks.getNumericValue(serializeSpreadsheetCellKey(e2))) : "")
      }
      sourceMatrix.push(row)
    }

    const targets: { rowIndex: number; colIndex: number }[] = []
    if (vertical) {
      const rows =
        rowBeyond > 0 ? inclusiveRange(src.rowEnd + 1, dropRow) : inclusiveRange(dropRow, src.rowStart - 1)
      for (const rr of rows) {
        for (let cc = src.colStart; cc <= src.colEnd; cc++) {
          if (registryEntryAt(registry, rr, cc)) targets.push({ rowIndex: rr, colIndex: cc })
        }
      }
    } else {
      const cols =
        colBeyond > 0 ? inclusiveRange(src.colEnd + 1, dropCol) : inclusiveRange(dropCol, src.colStart - 1)
      for (let rr = src.rowStart; rr <= src.rowEnd; rr++) {
        for (const cc of cols) {
          if (registryEntryAt(registry, rr, cc)) targets.push({ rowIndex: rr, colIndex: cc })
        }
      }
    }
    if (targets.length === 0) return

    const { assignments } = mapClipboardMatrixToTargets(sourceMatrix, src.rowStart, src.colStart, targets)
    for (const a of assignments) {
      const e2 = registryEntryAt(registry, a.rowIndex, a.colIndex)
      if (e2) callbacks.setValueFromPaste(serializeSpreadsheetCellKey(e2), a.raw ?? "")
    }
  }, [])

  const onCellDrop = useCallback(
    (rowIndex: number, colIndex: number, e: React.DragEvent) => {
      const src = dragSourceRef.current
      const kind = dragKindRef.current
      dragSourceRef.current = null
      dragKindRef.current = null
      setDropAnchor(null)
      if (!src || !kind) return
      e.preventDefault()
      if (kind === "move") applyMove(src, rowIndex, colIndex)
      else applyFill(src, rowIndex, colIndex)
    },
    [applyMove, applyFill]
  )

  const isDropTarget = useCallback(
    (rowIndex: number, colIndex: number) =>
      !!dropAnchor && dropAnchor.rowIndex === rowIndex && dropAnchor.colIndex === colIndex,
    [dropAnchor]
  )

  return {
    showMoveGrip,
    showFillHandle,
    isDropTarget,
    onGripDragStart,
    onFillHandleDragStart,
    onGripDragEnd: endDrag,
    onFillHandleDragEnd: endDrag,
    onCellDragOver,
    onCellDrop,
  }
}
