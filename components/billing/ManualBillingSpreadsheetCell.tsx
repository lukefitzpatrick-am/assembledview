"use client"

import type { ReactNode } from "react"

import { X } from "lucide-react"

import { serializeSpreadsheetCellKey } from "@/lib/spreadsheet/cellKey"
import { spreadsheetCellDomId } from "@/lib/spreadsheet/cellKey"
import type { SpreadsheetCellKey } from "@/lib/spreadsheet/types"
import { cn } from "@/lib/utils"
import type { BillingCellAdjustmentKind } from "@/lib/billing/billingLineAdjustmentIndicators"
import {
  DIVERGENT_BILLING_CELL_TOOLTIP,
  MANUAL_BILLING_ADJUSTMENT_TOOLTIP,
} from "@/lib/billing/billingLineAdjustmentIndicators"

import {
  spreadsheetCellOutlineClass,
  useManualBillingSpreadsheetCell,
} from "@/components/billing/manualBillingSpreadsheetContext"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type ManualBillingSpreadsheetCellProps = Readonly<{
  cellKey: SpreadsheetCellKey
  children: ReactNode
  className?: string
  adjustmentKind?: BillingCellAdjustmentKind | null
}>

export function ManualBillingSpreadsheetCell({
  cellKey,
  children,
  className,
  adjustmentKind = null,
}: ManualBillingSpreadsheetCellProps) {
  const ctx = useManualBillingSpreadsheetCell()
  const serialized = serializeSpreadsheetCellKey(cellKey)
  const coords = ctx.getCellCoords(serialized)

  if (!coords) {
    return <div className={className}>{children}</div>
  }

  const { rowIndex, colIndex } = coords
  const flags = ctx.getOutlineFlags(rowIndex, colIndex)
  const selected = ctx.isSelected(serialized)
  const copied = ctx.isCopied(serialized, rowIndex, colIndex)
  const outlineFlags = flags.inRange
    ? flags
    : { inRange: true, top: true, bottom: true, left: true, right: true }
  const focused = ctx.isFocused(serialized)
  const showClear = focused && ctx.getCellNumericValue(serialized) !== 0
  const moveGrip = ctx.showMoveGrip(rowIndex, colIndex)
  const dropTarget = ctx.isDropTarget(rowIndex, colIndex)
  const fillHandle = ctx.showFillHandle(rowIndex, colIndex)

  const tooltipLabel =
    adjustmentKind === "manual"
      ? MANUAL_BILLING_ADJUSTMENT_TOOLTIP
      : adjustmentKind === "divergent"
        ? DIVERGENT_BILLING_CELL_TOOLTIP
        : null

  const cell = (
    <div
      className={cn(
        "relative rounded-input",
        adjustmentKind === "manual" && "bg-pacing-behind-bg",
        focused && "ring-2 ring-inset ring-primary",
        !focused && (selected || copied) && spreadsheetCellOutlineClass(outlineFlags),
        copied && adjustmentKind !== "manual" && "bg-pacing-behind-bg",
        dropTarget && "ring-2 ring-inset ring-primary/60",
        className
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        ctx.onCellPointerDown(serialized, rowIndex, colIndex, e)
      }}
      onPointerEnter={() => ctx.onCellPointerEnter(rowIndex, colIndex)}
      onDragOver={(e) => ctx.onCellDragOver(rowIndex, colIndex, e)}
      onDrop={(e) => ctx.onCellDrop(rowIndex, colIndex, e)}
    >
      {children}
      {moveGrip ? (
        <div
          draggable
          aria-label="Move selection"
          title="Drag to move"
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-move rounded-l-input bg-primary/70 hover:bg-primary"
          onPointerDown={(e) => e.stopPropagation()}
          onDragStart={(e) => ctx.onGripDragStart(e)}
          onDragEnd={() => ctx.onGripDragEnd()}
        />
      ) : null}
      {fillHandle ? (
        <div
          draggable
          aria-label="Fill"
          title="Drag to fill"
          className="absolute bottom-0 right-0 z-10 h-2 w-2 cursor-crosshair rounded-input bg-primary"
          onPointerDown={(e) => e.stopPropagation()}
          onDragStart={(e) => ctx.onFillHandleDragStart(e)}
          onDragEnd={() => ctx.onFillHandleDragEnd()}
        />
      ) : null}
      {showClear ? (
        <button
          type="button"
          aria-label="Clear cell"
          className="absolute right-0 top-0 z-10 -translate-y-1/2 translate-x-1/2 rounded-pill border border-border bg-background p-0.5 text-muted-foreground shadow-e1 hover:text-foreground"
          onPointerDown={(e) => {
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            ctx.clearCell(serialized)
          }}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  )

  if (!tooltipLabel) return cell

  return (
    <Tooltip>
      <TooltipTrigger asChild>{cell}</TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  )
}

export function wrapSpreadsheetInputProps(
  cellKey: SpreadsheetCellKey,
  inputProps: {
    id?: string
    onFocus?: React.FocusEventHandler<HTMLInputElement>
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  }
): {
  id: string
  onFocus: React.FocusEventHandler<HTMLInputElement>
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement>
} {
  const serialized = serializeSpreadsheetCellKey(cellKey)
  return {
    id: spreadsheetCellDomId(serialized),
    onFocus: (e) => {
      inputProps.onFocus?.(e)
    },
    onKeyDown: (e) => {
      inputProps.onKeyDown?.(e)
    },
  }
}
