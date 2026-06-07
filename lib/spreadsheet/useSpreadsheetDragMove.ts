"use client"

import { useCallback, useRef, useState } from "react"

import { serializeSpreadsheetCellKey } from "@/lib/spreadsheet/cellKey"
import type { BuiltSpreadsheetRegistry } from "@/lib/spreadsheet/registry"
import { registryEntryAt } from "@/lib/spreadsheet/registry"
import type { SpreadsheetRectSelection } from "@/lib/spreadsheet/types"

type MoveSourceBounds = Readonly<{
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}>

export type SpreadsheetDragMoveCallbacks = Readonly<{
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

export function useSpreadsheetDragMove(args: UseSpreadsheetDragMoveArgs) {
  const argsRef = useRef(args)
  argsRef.current = args

  const dragSourceRef = useRef<MoveSourceBounds | null>(null)
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

  const onGripDragStart = useCallback(
    (e: React.DragEvent) => {
      const bounds = resolveMoveBounds()
      if (!bounds) {
        e.preventDefault()
        return
      }
      dragSourceRef.current = bounds
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", "mb-move")
    },
    [resolveMoveBounds]
  )

  const onGripDragEnd = useCallback(() => {
    dragSourceRef.current = null
    setDropAnchor(null)
  }, [])

  const onCellDragOver = useCallback((rowIndex: number, colIndex: number, e: React.DragEvent) => {
    if (!dragSourceRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDropAnchor((prev) =>
      prev && prev.rowIndex === rowIndex && prev.colIndex === colIndex ? prev : { rowIndex, colIndex }
    )
  }, [])

  const onCellDrop = useCallback((rowIndex: number, colIndex: number, e: React.DragEvent) => {
    const src = dragSourceRef.current
    dragSourceRef.current = null
    setDropAnchor(null)
    if (!src) return
    e.preventDefault()

    const { registry, callbacks, onInvalidDrop } = argsRef.current
    const dRow = rowIndex - src.rowStart
    const dCol = colIndex - src.colStart
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

  const isDropTarget = useCallback(
    (rowIndex: number, colIndex: number) =>
      !!dropAnchor && dropAnchor.rowIndex === rowIndex && dropAnchor.colIndex === colIndex,
    [dropAnchor]
  )

  return {
    showMoveGrip,
    isDropTarget,
    onGripDragStart,
    onGripDragEnd,
    onCellDragOver,
    onCellDrop,
  }
}
