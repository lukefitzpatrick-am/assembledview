"use client"

import { forwardRef, useState, type InputHTMLAttributes } from "react"
import { formatMoney, parseMoneyInput } from "@/lib/format/money"
import { cn } from "@/lib/utils"

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** The numeric value of the input. Null means empty. */
  value: number | null | undefined
  /** Called with the parsed number on blur, or null if the input is empty/invalid. */
  onChange: (value: number | null) => void
  /** Optional locale override. Defaults to "en-AU". */
  locale?: string
  /** Optional currency override. Defaults to "AUD". */
  currency?: string
}

/**
 * Editable money input with format-on-blur display.
 *
 * Behaviour:
 * - On initial render and on blur: displays formatted currency (e.g. "$2,160.00")
 * - On focus: displays raw numeric string for editing (e.g. "2160")
 * - On change while focused: stores raw string, defers parsing to blur
 * - On blur: parses raw string, calls onChange with number or null, returns to formatted display
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, locale = "en-AU", currency = "AUD", className, ...rest },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false)
  const [rawValue, setRawValue] = useState<string>(value != null ? String(value) : "")

  const formattedValue = value != null ? formatMoney(value, { locale, currency }) : ""

  const displayValue = isFocused ? rawValue : formattedValue

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onFocus={(e) => {
        setIsFocused(true)
        setRawValue(value != null ? String(value) : "")
        rest.onFocus?.(e)
      }}
      onBlur={(e) => {
        setIsFocused(false)
        const parsed = parseMoneyInput(rawValue)
        onChange(parsed ?? null)
        rest.onBlur?.(e)
      }}
      onChange={(e) => {
        setRawValue(e.target.value)
        // Don't call onChange while focused — defer to blur so partial edits
        // don't trigger downstream re-renders or save logic.
      }}
      className={cn("w-full", className)}
      {...rest}
    />
  )
})

MoneyInput.displayName = "MoneyInput"
