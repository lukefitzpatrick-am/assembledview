"use client"

import type { ReactNode } from "react"

import { X } from "lucide-react"

import { serializeSpreadsheetCellKey } from "@/lib/spreadsheet/cellKey"
import { spreadsheetCellDomId } from "@/lib/spreadsheet/cellKey"
import type { SpreadsheetCellKey } from "@/lib/spreadsheet/types"
import { cn } from "@/lib/utils"

import {
  spreadsheetCellOutlineClass,
  useManualBillingSpreadsheetCell,
} from "@/components/billing/manualBillingSpreadsheetContext"

type ManualBillingSpreadsheetCellProps = Readonly<{
  cellKey: SpreadsheetCellKey
  children: ReactNode
  className?: string
}>

export function ManualBillingSpreadsheetCell({
  cellKey,
  children,
  className,
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

  return (
    <div
      className={cn(
        "relative rounded-sm",
        focused && "ring-2 ring-inset ring-primary",
        !focused && (selected || copied) && spreadsheetCellOutlineClass(outlineFlags),
        copied && "bg-amber-500/15",
        className
      )}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        ctx.onCellPointerDown(serialized, rowIndex, colIndex, e)
      }}
      onPointerEnter={() => ctx.onCellPointerEnter(rowIndex, colIndex)}
    >
      {children}
      {showClear ? (
        <button
          type="button"
          aria-label="Clear cell"
          className="absolute right-0 top-0 z-10 -translate-y-1/2 translate-x-1/2 rounded-full border bg-background p-0.5 text-muted-foreground shadow-sm hover:text-foreground"
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
