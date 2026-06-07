"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { serializeSpreadsheetCellKey } from "@/lib/spreadsheet/cellKey"
import type { BuiltSpreadsheetRegistry } from "@/lib/spreadsheet/registry"
import { registryEntryAt } from "@/lib/spreadsheet/registry"
import {
  keysInRect,
  normalizeSpreadsheetRect,
  registryEntryInRect,
} from "@/lib/spreadsheet/selection"
import type {
  SpreadsheetCopiedCells,
  SpreadsheetRectSelection,
} from "@/lib/spreadsheet/types"

export type UseSpreadsheetSelectionArgs = Readonly<{
  registry: BuiltSpreadsheetRegistry
  getNumericValue: (serializedKey: string) => number
}>

export function useSpreadsheetSelection({ registry, getNumericValue }: UseSpreadsheetSelectionArgs) {
  const [focused, setFocused] = useState<{
    serializedKey: string
    rowIndex: number
    colIndex: number
  } | null>(null)
  const focusedRef = useRef(focused)
  focusedRef.current = focused

  const [rectSelection, setRectSelection] = useState<SpreadsheetRectSelection | null>(null)
  const rectSelectionRef = useRef(rectSelection)
  rectSelectionRef.current = rectSelection

  const [stripSelection, setStripSelection] = useState<{ rowIndex: number } | null>(null)
  const stripSelectionRef = useRef(stripSelection)
  stripSelectionRef.current = stripSelection

  const [multiSelect, setMultiSelect] = useState<{ rowIndex: number; cols: number[] } | null>(
    null
  )
  const multiSelectRef = useRef(multiSelect)
  multiSelectRef.current = multiSelect

  const [copiedCells, setCopiedCells] = useState<SpreadsheetCopiedCells | null>(null)

  const [multiCellSelection, setMultiCellSelection] = useState<Set<string> | null>(null)
  const multiCellSelectionRef = useRef(multiCellSelection)
  multiCellSelectionRef.current = multiCellSelection

  const multiClickGuardRef = useRef(false)

  const [isSelecting, setIsSelecting] = useState(false)

  const dragAnchorRef = useRef<{ rowIndex: number; colIndex: number } | null>(null)

  const selectedKeySet = useMemo(() => {
    const set = new Set<string>()
    if (multiCellSelection && multiCellSelection.size > 0) {
      const valid = new Set(
        registry.entries.map((e) => serializeSpreadsheetCellKey(e))
      )
      for (const k of multiCellSelection) {
        if (valid.has(k)) set.add(k)
      }
    } else if (rectSelection) {
      for (const k of keysInRect(registry.entries, rectSelection, serializeSpreadsheetCellKey)) {
        set.add(k)
      }
    } else if (stripSelection) {
      for (const e of registry.entries) {
        if (e.rowIndex === stripSelection.rowIndex) {
          set.add(serializeSpreadsheetCellKey(e))
        }
      }
    } else if (multiSelect) {
      const colSet = new Set(multiSelect.cols)
      for (const e of registry.entries) {
        if (e.rowIndex === multiSelect.rowIndex && colSet.has(e.colIndex)) {
          set.add(serializeSpreadsheetCellKey(e))
        }
      }
    } else if (focused) {
      set.add(focused.serializedKey)
    }
    return set
  }, [multiCellSelection, rectSelection, stripSelection, multiSelect, focused, registry.entries])

  const statusBar = useMemo(() => {
    if (selectedKeySet.size < 2) return null
    let sum = 0
    let count = 0
    for (const key of selectedKeySet) {
      const n = getNumericValue(key)
      count++
      sum += n
    }
    return { count, sum }
  }, [selectedKeySet, getNumericValue])

  const isCopied = useCallback(
    (serializedKey: string, rowIndex: number, colIndex: number) => {
      if (!copiedCells) return false
      const { selection } = copiedCells
      return (
        rowIndex >= selection.startRow &&
        rowIndex <= selection.endRow &&
        colIndex >= selection.startCol &&
        colIndex <= selection.endCol
      )
    },
    [copiedCells]
  )

  const clearSelections = useCallback(() => {
    setRectSelection(null)
    setStripSelection(null)
    setMultiSelect(null)
    setMultiCellSelection(null)
  }, [])

  const focusCell = useCallback(
    (serializedKey: string, rowIndex: number, colIndex: number) => {
      if (multiClickGuardRef.current) {
        multiClickGuardRef.current = false
        setFocused({ serializedKey, rowIndex, colIndex })
        return
      }
      setFocused({ serializedKey, rowIndex, colIndex })
      clearSelections()
    },
    [clearSelections]
  )

  const onCellPointerDown = useCallback(
    (
      serializedKey: string,
      rowIndex: number,
      colIndex: number,
      e: React.PointerEvent
    ) => {
      if (e.button !== 0) return

      // Ctrl/Cmd+click: toggle a disjoint multi-cell selection
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        multiClickGuardRef.current = true
        const seedFrom = focusedRef.current
        setRectSelection(null)
        setStripSelection(null)
        setMultiSelect(null)
        setMultiCellSelection((prev) => {
          const next = new Set(prev ?? [])
          if (!prev || prev.size === 0) {
            if (seedFrom && seedFrom.serializedKey !== serializedKey) {
              next.add(seedFrom.serializedKey)
            }
          }
          if (next.has(serializedKey)) next.delete(serializedKey)
          else next.add(serializedKey)
          return next.size > 0 ? next : null
        })
        setFocused({ serializedKey, rowIndex, colIndex })
        return
      }

      if (e.shiftKey && focusedRef.current) {
        const anchor = focusedRef.current
        multiClickGuardRef.current = false
        setMultiSelect(null)
        setStripSelection(null)
        setMultiCellSelection(null)
        setRectSelection(
          normalizeSpreadsheetRect(anchor.rowIndex, anchor.colIndex, rowIndex, colIndex)
        )
        e.preventDefault()
        return
      }

      multiClickGuardRef.current = false
      dragAnchorRef.current = { rowIndex, colIndex }
      setIsSelecting(true)
      setStripSelection(null)
      setMultiSelect(null)
      setMultiCellSelection(null)
      setRectSelection(normalizeSpreadsheetRect(rowIndex, colIndex, rowIndex, colIndex))
      setFocused({ serializedKey, rowIndex, colIndex })
    },
    []
  )

  const onCellPointerEnter = useCallback(
    (rowIndex: number, colIndex: number) => {
      if (!isSelecting || !dragAnchorRef.current) return
      const a = dragAnchorRef.current
      setRectSelection(normalizeSpreadsheetRect(a.rowIndex, a.colIndex, rowIndex, colIndex))
    },
    [isSelecting]
  )

  useEffect(() => {
    const end = () => {
      setIsSelecting(false)
      dragAnchorRef.current = null
    }
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    return () => {
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
    }
  }, [])

  const onCellCtrlA = useCallback((rowIndex: number) => {
    setStripSelection({ rowIndex })
    setRectSelection(null)
    setMultiSelect(null)
    setMultiCellSelection(null)
  }, [])

  const getFocused = useCallback(() => focusedRef.current, [])
  const getRectSelection = useCallback(() => rectSelectionRef.current, [])
  const getStripSelection = useCallback(() => stripSelectionRef.current, [])
  const getMultiSelect = useCallback(() => multiSelectRef.current, [])

  const getMultiCellSelection = useCallback(() => multiCellSelectionRef.current, [])

  const isSelected = useCallback(
    (serializedKey: string) => selectedKeySet.has(serializedKey),
    [selectedKeySet]
  )

  const getOutlineFlags = useCallback(
    (rowIndex: number, colIndex: number) => {
      const rect = rectSelection
      if (!rect || !registryEntryInRect({ rowIndex, colIndex }, rect)) {
        return { inRange: false, top: false, bottom: false, left: false, right: false }
      }
      return {
        inRange: true,
        top: rowIndex === rect.rowStart,
        bottom: rowIndex === rect.rowEnd,
        left: colIndex === rect.colStart,
        right: colIndex === rect.colEnd,
      }
    },
    [rectSelection]
  )

  return {
    focused,
    focusCell,
    selectedKeySet,
    statusBar,
    isSelected,
    isCopied,
    getOutlineFlags,
    onCellPointerDown,
    onCellPointerEnter,
    onCellCtrlA,
    getFocused,
    getRectSelection,
    getStripSelection,
    getMultiSelect,
    getMultiCellSelection,
    setCopiedCells,
    copiedCells,
    clearSelections,
  }
}
