"use client"

import { Input } from "@/components/ui/input"
import { ManualBillingSpreadsheetCell } from "@/components/billing/ManualBillingSpreadsheetCell"
import { useManualBillingSpreadsheetCell } from "@/components/billing/manualBillingSpreadsheetContext"
import { serializeSpreadsheetCellKey, spreadsheetCellDomId } from "@/lib/spreadsheet/cellKey"
import type { SpreadsheetCellKey } from "@/lib/spreadsheet/types"
import { cn } from "@/lib/utils"

type Props = Readonly<{
  cellKey: SpreadsheetCellKey
  value: string
  className?: string
  onChange: (next: string) => void
  onBlur: (raw: string) => void
}>

export function ManualBillingSpreadsheetCostInput({
  cellKey,
  value,
  className,
  onChange,
  onBlur,
}: Props) {
  const ctx = useManualBillingSpreadsheetCell()
  const serialized = serializeSpreadsheetCellKey(cellKey)
  const coords = ctx.getCellCoords(serialized)

  const input = (
    <Input
      id={coords ? spreadsheetCellDomId(serialized) : undefined}
      className={cn("text-right w-28", className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onBlur(e.target.value)}
      onFocus={
        coords
          ? () => ctx.onInputFocus(serialized, coords.rowIndex, coords.colIndex)
          : undefined
      }
      onKeyDown={
        coords
          ? (e) => ctx.onInputKeyDown(serialized, coords.rowIndex, coords.colIndex, e)
          : undefined
      }
    />
  )

  if (!coords) return input

  return (
    <ManualBillingSpreadsheetCell cellKey={cellKey} className="inline-block">
      {input}
    </ManualBillingSpreadsheetCell>
  )
}
