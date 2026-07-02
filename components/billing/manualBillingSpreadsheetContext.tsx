"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type KeyboardEvent,
  type ReactNode,
} from "react"

import { ManualBillingAdjustmentLegend } from "@/components/billing/ManualBillingAdjustmentLegend"
import { buildManualBillingSpreadsheetRegistry } from "@/lib/billing/buildManualBillingSpreadsheetRegistry"
import type { ManualBillingMediaSection } from "@/lib/billing/buildManualBillingSpreadsheetRegistry"
import {
  buildBillingLineAdjustmentMaps,
  getBillingCellAdjustmentKind,
  type BillingCellAdjustmentKind,
  type BillingLineAdjustmentMaps,
} from "@/lib/billing/billingLineAdjustmentIndicators"
import { parseBillingAmountRaw } from "@/lib/billing/parseBillingAmount"
import type { BillingMonth } from "@/lib/billing/types"
import { serializeSpreadsheetCellKey, spreadsheetCellDomId } from "@/lib/spreadsheet/cellKey"
import { handleSpreadsheetInputKeyDown } from "@/lib/spreadsheet/keyboardNav"
import { parseSpreadsheetCellKey } from "@/lib/spreadsheet/cellKey"
import type { SpreadsheetCellKey } from "@/lib/spreadsheet/types"
import { useSpreadsheetClipboard } from "@/lib/spreadsheet/useSpreadsheetClipboard"
import { useSpreadsheetDragMove } from "@/lib/spreadsheet/useSpreadsheetDragMove"
import { useSpreadsheetSelection } from "@/lib/spreadsheet/useSpreadsheetSelection"
import { cn } from "@/lib/utils"

import { ManualBillingSelectionStatusBar } from "@/components/billing/ManualBillingSelectionStatusBar"
import { toast } from "@/components/ui/use-toast"
import { TooltipProvider } from "@/components/ui/tooltip"

export type ManualBillingSpreadsheetCallbacks = Readonly<{
  getLineItemAmount: (mediaKey: string, lineItemId: string, monthYear: string) => number
  getCostFieldRaw: (rowId: string, monthYear: string) => string
  setLineBillingMode: (lineItemId: string, mode: "auto" | "manual") => void
  onLineItemPaste: (mediaKey: string, lineItemId: string, monthYear: string, raw: string) => void
  onLineItemClear: (mediaKey: string, lineItemId: string, monthYear: string) => void
  onCostPaste: (rowId: string, monthYear: string, raw: string) => void
  onCostClear: (rowId: string, monthYear: string) => void
}>

type ProviderProps = Readonly<{
  children: ReactNode
  /** Rendered below the selection status bar (e.g. modal Cancel / Save footer). */
  footer?: ReactNode
  months: BillingMonth[]
  /** Burst-derived reference for divergent-cell highlighting (optional). */
  autoReferenceMonths?: BillingMonth[]
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
  isFocused: (serializedKey: string) => boolean
  getCellNumericValue: (serializedKey: string) => number
  clearCell: (serializedKey: string) => void
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
  showMoveGrip: (rowIndex: number, colIndex: number) => boolean
  isDropTarget: (rowIndex: number, colIndex: number) => boolean
  onGripDragStart: (e: React.DragEvent) => void
  onGripDragEnd: () => void
  onCellDragOver: (rowIndex: number, colIndex: number, e: React.DragEvent) => void
  onCellDrop: (rowIndex: number, colIndex: number, e: React.DragEvent) => void
  showFillHandle: (rowIndex: number, colIndex: number) => boolean
  onFillHandleDragStart: (e: React.DragEvent) => void
  onFillHandleDragEnd: () => void
  getLineItemCellAdjustmentKind: (
    lineItemId: string,
    monthYear: string
  ) => BillingCellAdjustmentKind | null
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
  footer,
  months,
  autoReferenceMonths,
  expandedAccordionValues,
  mediaSections,
  formatter,
  scopeMediaKeys = null,
  includeCostTable = true,
  callbacks,
  onPasteLayout,
}: ProviderProps) {
  const adjustmentMaps = useMemo<BillingLineAdjustmentMaps>(
    () => buildBillingLineAdjustmentMaps(months, autoReferenceMonths),
    [months, autoReferenceMonths]
  )

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
    getMultiCellSelection: selection.getMultiCellSelection,
    setCopiedCells: selection.setCopiedCells,
    callbacks: valueCallbacks,
    onPasteLayout,
    onBlockedCopyPaste: (kind) => {
      if (kind === "copy") {
        toast({
          title: "Can't copy a non-adjacent selection",
          description:
            "Copy works on a single block of cells. Clear the multi-select and try again.",
        })
      } else {
        toast({
          title: "Can't paste a block onto a non-adjacent selection",
          description:
            "Paste a single value to fill the selected cells, or select one block.",
        })
      }
    },
  })

  const dragMove = useSpreadsheetDragMove({
    registry,
    getFocused: selection.getFocused,
    getRectSelection: selection.getRectSelection,
    getStripSelection: selection.getStripSelection,
    getMultiCellSelection: selection.getMultiCellSelection,
    callbacks: {
      getNumericValue,
      setValueFromPaste: valueCallbacks.setValueFromPaste,
      clearValue: valueCallbacks.clearValue,
    },
    onInvalidDrop: () => {
      toast({
        title: "Can't move there",
        description: "Part of the selection would fall outside the grid.",
      })
    },
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
      isFocused: (serializedKey) => selection.focused?.serializedKey === serializedKey,
      getCellNumericValue: getNumericValue,
      clearCell: (serializedKey) => valueCallbacks.clearValue(serializedKey),
      onCellPointerDown: selection.onCellPointerDown,
      onCellPointerEnter: selection.onCellPointerEnter,
      onInputFocus: (serializedKey, rowIndex, colIndex) => {
        selection.focusCell(serializedKey, rowIndex, colIndex)
      },
      showMoveGrip: dragMove.showMoveGrip,
      isDropTarget: dragMove.isDropTarget,
      onGripDragStart: dragMove.onGripDragStart,
      onGripDragEnd: dragMove.onGripDragEnd,
      onCellDragOver: dragMove.onCellDragOver,
      onCellDrop: dragMove.onCellDrop,
      showFillHandle: dragMove.showFillHandle,
      onFillHandleDragStart: dragMove.onFillHandleDragStart,
      onFillHandleDragEnd: dragMove.onFillHandleDragEnd,
      getLineItemCellAdjustmentKind: (lineItemId, monthYear) =>
        getBillingCellAdjustmentKind(adjustmentMaps, lineItemId, monthYear),
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
    [adjustmentMaps, keyToCoords, registry, selection, getNumericValue, valueCallbacks, dragMove]
  )

  return (
    <TooltipProvider delayDuration={200}>
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
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-border px-6 py-2">
              <ManualBillingAdjustmentLegend />
            </div>
            {children}
          </div>
          {selection.statusBar ? (
            <ManualBillingSelectionStatusBar
              count={selection.statusBar.count}
              sum={selection.statusBar.sum}
              formatter={formatter}
            />
          ) : null}
          {footer ?? null}
        </div>
      </SpreadsheetCellContext.Provider>
    </TooltipProvider>
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
