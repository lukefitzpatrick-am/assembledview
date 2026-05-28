"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type KeyboardEvent,
  type ReactNode,
} from "react"

import { buildManualBillingSpreadsheetRegistry } from "@/lib/billing/buildManualBillingSpreadsheetRegistry"
import type { ManualBillingMediaSection } from "@/lib/billing/buildManualBillingSpreadsheetRegistry"
import { parseBillingAmountRaw } from "@/lib/billing/parseBillingAmount"
import type { BillingMonth } from "@/lib/billing/types"
import { serializeSpreadsheetCellKey, spreadsheetCellDomId } from "@/lib/spreadsheet/cellKey"
import { handleSpreadsheetInputKeyDown } from "@/lib/spreadsheet/keyboardNav"
import { parseSpreadsheetCellKey } from "@/lib/spreadsheet/cellKey"
import type { SpreadsheetCellKey } from "@/lib/spreadsheet/types"
import { useSpreadsheetClipboard } from "@/lib/spreadsheet/useSpreadsheetClipboard"
import { useSpreadsheetSelection } from "@/lib/spreadsheet/useSpreadsheetSelection"
import { cn } from "@/lib/utils"

import { ManualBillingSelectionStatusBar } from "@/components/billing/ManualBillingSelectionStatusBar"

export type ManualBillingSpreadsheetCallbacks = Readonly<{
  getLineItemAmount: (mediaKey: string, lineItemId: string, monthYear: string) => number
  getCostFieldRaw: (rowId: string, monthYear: string) => string
  onLineItemPaste: (mediaKey: string, lineItemId: string, monthYear: string, raw: string) => void
  onLineItemClear: (mediaKey: string, lineItemId: string, monthYear: string) => void
  onCostPaste: (rowId: string, monthYear: string, raw: string) => void
  onCostClear: (rowId: string, monthYear: string) => void
}>

type ProviderProps = Readonly<{
  children: ReactNode
  months: BillingMonth[]
  expandedAccordionValues: string[]
  mediaSections: ManualBillingMediaSection[]
  formatter: Intl.NumberFormat
  scopeMediaKeys?: readonly string[] | null
  includeCostTable?: boolean
  callbacks: ManualBillingSpreadsheetCallbacks
  onPasteLayout?: (layout: "tile" | "clip" | "direct") => void
}>

type CellContextValue = Readonly<{
  registerCell: (key: SpreadsheetCellKey, rowIndex: number, colIndex: number) => void
  getCellCoords: (serializedKey: string) => { rowIndex: number; colIndex: number } | null
  isSelected: (serializedKey: string) => boolean
  isCopied: (serializedKey: string, rowIndex: number, colIndex: number) => boolean
  getOutlineFlags: (rowIndex: number, colIndex: number) => {
    inRange: boolean
    top: boolean
    bottom: boolean
    left: boolean
    right: boolean
  }
  onCellPointerDown: (
    serializedKey: string,
    rowIndex: number,
    colIndex: number,
    e: React.PointerEvent
  ) => void
  onCellPointerEnter: (rowIndex: number, colIndex: number) => void
  onInputKeyDown: (
    serializedKey: string,
    rowIndex: number,
    colIndex: number,
    e: KeyboardEvent<HTMLInputElement>
  ) => void
  onInputFocus: (serializedKey: string, rowIndex: number, colIndex: number) => void
}>

const SpreadsheetCellContext = createContext<CellContextValue | null>(null)

export function useManualBillingSpreadsheetCell() {
  const ctx = useContext(SpreadsheetCellContext)
  if (!ctx) {
    throw new Error("useManualBillingSpreadsheetCell must be used within ManualBillingSpreadsheetProvider")
  }
  return ctx
}

export function ManualBillingSpreadsheetProvider({
  children,
  months,
  expandedAccordionValues,
  mediaSections,
  formatter,
  scopeMediaKeys = null,
  includeCostTable = true,
  callbacks,
  onPasteLayout,
}: ProviderProps) {
  const registry = useMemo(
    () =>
      buildManualBillingSpreadsheetRegistry({
        months,
        expandedAccordionValues,
        mediaSections,
        includeCostTable,
        scopeMediaKeys,
      }),
    [months, expandedAccordionValues, mediaSections, includeCostTable, scopeMediaKeys]
  )

  const getNumericValue = useCallback(
    (serializedKey: string) => {
      const key = parseSpreadsheetCellKey(serializedKey)
      if (!key) return 0
      if (key.rowKind === "lineItem") {
        return callbacks.getLineItemAmount(key.tableKey, key.rowId, key.monthYear)
      }
      return parseBillingAmountRaw(callbacks.getCostFieldRaw(key.rowId, key.monthYear))
    },
    [callbacks]
  )

  const selection = useSpreadsheetSelection({ registry, getNumericValue })

  const valueCallbacks = useMemo(
    () => ({
      getCopyText: (serializedKey: string) => {
        const n = getNumericValue(serializedKey)
        if (n === 0) return ""
        return String(n)
      },
      getNumericValue,
      setValueFromPaste: (serializedKey: string, raw: string) => {
        const key = parseSpreadsheetCellKey(serializedKey)
        if (!key) return
        if (key.rowKind === "lineItem") {
          callbacks.onLineItemPaste(key.tableKey, key.rowId, key.monthYear, raw)
        } else {
          callbacks.onCostPaste(key.rowId, key.monthYear, raw)
        }
      },
      clearValue: (serializedKey: string) => {
        const key = parseSpreadsheetCellKey(serializedKey)
        if (!key) return
        if (key.rowKind === "lineItem") {
          callbacks.onLineItemClear(key.tableKey, key.rowId, key.monthYear)
        } else {
          callbacks.onCostClear(key.rowId, key.monthYear)
        }
      },
    }),
    [callbacks, getNumericValue]
  )

  const clipboard = useSpreadsheetClipboard({
    registry,
    getFocused: selection.getFocused,
    getRectSelection: selection.getRectSelection,
    getStripSelection: selection.getStripSelection,
    getMultiSelect: selection.getMultiSelect,
    setCopiedCells: selection.setCopiedCells,
    callbacks: valueCallbacks,
    onPasteLayout,
  })

  const keyToCoords = useMemo(() => {
    const m = new Map<string, { rowIndex: number; colIndex: number }>()
    for (const e of registry.entries) {
      m.set(serializeSpreadsheetCellKey(e), {
        rowIndex: e.rowIndex,
        colIndex: e.colIndex,
      })
    }
    return m
  }, [registry.entries])

  const cellCtx = useMemo<CellContextValue>(
    () => ({
      registerCell: () => {},
      getCellCoords: (serializedKey) => keyToCoords.get(serializedKey) ?? null,
      isSelected: selection.isSelected,
      isCopied: selection.isCopied,
      getOutlineFlags: selection.getOutlineFlags,
      onCellPointerDown: selection.onCellPointerDown,
      onCellPointerEnter: selection.onCellPointerEnter,
      onInputFocus: (serializedKey, rowIndex, colIndex) => {
        selection.focusCell(serializedKey, rowIndex, colIndex)
      },
      onInputKeyDown: (serializedKey, rowIndex, colIndex, e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
          e.preventDefault()
          selection.onCellCtrlA(rowIndex)
          return
        }
        handleSpreadsheetInputKeyDown({
          registry,
          serializedKey,
          rowIndex,
          colIndex,
          event: e,
        })
      },
    }),
    [keyToCoords, registry, selection]
  )

  return (
    <SpreadsheetCellContext.Provider value={cellCtx}>
      <div
        className="flex min-h-0 flex-1 flex-col"
        onKeyDownCapture={clipboard.handleGridKeyDownCapture}
        onPasteCapture={clipboard.handlePasteCapture}
        onCopyCapture={(e) => {
          void clipboard.copySelection()
          e.preventDefault()
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {selection.statusBar ? (
          <ManualBillingSelectionStatusBar
            count={selection.statusBar.count}
            sum={selection.statusBar.sum}
            formatter={formatter}
          />
        ) : null}
      </div>
    </SpreadsheetCellContext.Provider>
  )
}

export function spreadsheetCellOutlineClass(flags: {
  inRange: boolean
  top: boolean
  bottom: boolean
  left: boolean
  right: boolean
}): string {
  if (!flags.inRange) return ""
  return cn(
    "ring-2 ring-inset ring-primary/70 bg-primary/10",
    flags.top && "ring-t-primary",
    flags.bottom && "ring-b-primary",
    flags.left && "ring-l-primary",
    flags.right && "ring-r-primary"
  )
}
