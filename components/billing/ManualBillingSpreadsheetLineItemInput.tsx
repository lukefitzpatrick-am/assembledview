"use client"

import { EditableLineItemMonthInput } from "@/components/billing/EditableLineItemMonthInput"
import { ManualBillingSpreadsheetCell } from "@/components/billing/ManualBillingSpreadsheetCell"
import { useManualBillingSpreadsheetCell } from "@/components/billing/manualBillingSpreadsheetContext"
import { serializeSpreadsheetCellKey, spreadsheetCellDomId } from "@/lib/spreadsheet/cellKey"
import type { SpreadsheetCellKey } from "@/lib/spreadsheet/types"
import { cn } from "@/lib/utils"

type Props = Readonly<{
  cellKey: SpreadsheetCellKey
  amount: number
  formatter: Intl.NumberFormat
  className?: string
  onAmountChange: (numericValue: number) => void
  onCommit: (rawValue: string) => void
}>

export function ManualBillingSpreadsheetLineItemInput({
  cellKey,
  amount,
  formatter,
  className,
  onAmountChange,
  onCommit,
}: Props) {
  const ctx = useManualBillingSpreadsheetCell()
  const serialized = serializeSpreadsheetCellKey(cellKey)
  const coords = ctx.getCellCoords(serialized)
  const adjustmentKind =
    cellKey.rowKind === "lineItem"
      ? ctx.getLineItemCellAdjustmentKind(cellKey.rowId, cellKey.monthYear)
      : null

  const input = (
    <EditableLineItemMonthInput
      id={coords ? spreadsheetCellDomId(serialized) : undefined}
      className={cn(
        className,
        adjustmentKind === "divergent" && "underline decoration-dashed decoration-muted-foreground underline-offset-4"
      )}
      amount={amount}
      formatter={formatter}
      onAmountChange={onAmountChange}
      onCommit={onCommit}
      onKeyDown={
        coords
          ? (e) => ctx.onInputKeyDown(serialized, coords.rowIndex, coords.colIndex, e)
          : undefined
      }
      onFocus={
        coords
          ? () => ctx.onInputFocus(serialized, coords.rowIndex, coords.colIndex)
          : undefined
      }
    />
  )

  if (!coords) return input

  return (
    <ManualBillingSpreadsheetCell
      cellKey={cellKey}
      className="inline-block"
      adjustmentKind={adjustmentKind}
    >
      {input}
    </ManualBillingSpreadsheetCell>
  )
}
