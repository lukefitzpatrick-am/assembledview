"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

function parseBillingAmountInput(raw: string): number {
  return parseFloat(raw.replace(/[^0-9.-]/g, "")) || 0
}

export type EditableLineItemMonthInputProps = {
  className?: string
  id?: string
  amount: number
  formatter: Intl.NumberFormat
  /** Fires on every change while the user is typing; commit full schedule logic is usually on `onCommit` (blur). */
  onAmountChange: (numericValue: number) => void
  onCommit: (rawValue: string) => void
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
  onFocus?: React.FocusEventHandler<HTMLInputElement>
  disabled?: boolean
}

/**
 * Currency line-item cell for manual billing: while focused, keeps a local string draft so
 * the parent can re-apply `formatter.format(n)` on blur without fighting cursor/selection on each keystroke.
 */
export function EditableLineItemMonthInput({
  className,
  id,
  amount,
  formatter,
  onAmountChange,
  onCommit,
  onKeyDown,
  onFocus,
  disabled = false,
}: EditableLineItemMonthInputProps) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState("")

  const displayValue = focused ? draft : formatter.format(amount)

  return (
    <Input
      type="text"
      inputMode="decimal"
      id={id}
      disabled={disabled}
      readOnly={disabled}
      className={cn("text-right w-28", className)}
      value={displayValue}
      onFocus={(e) => {
        if (disabled) return
        setFocused(true)
        setDraft(formatter.format(amount))
        onFocus?.(e)
      }}
      onChange={(e) => {
        if (disabled) return
        const next = e.target.value
        setDraft(next)
        onAmountChange(parseBillingAmountInput(next))
      }}
      onBlur={() => {
        if (disabled) {
          setFocused(false)
          return
        }
        onCommit(draft)
        setFocused(false)
      }}
      onKeyDown={onKeyDown}
    />
  )
}
