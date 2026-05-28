"use client"

import type { ReactNode } from "react"

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

  return (
    <div
      className={cn(
        "relative rounded-sm",
        (selected || copied) && spreadsheetCellOutlineClass(outlineFlags),
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
