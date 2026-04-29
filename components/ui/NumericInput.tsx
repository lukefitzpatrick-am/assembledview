"use client"

import { forwardRef, useState, type InputHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

type NumericInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** The numeric value of the input. Null means empty. */
  value: number | null | undefined
  /** Called with the parsed number on blur, or null if the input is empty/invalid. */
  onChange: (value: number | null) => void
  /** Number of decimal places to display when not focused. Defaults to 4. */
  decimals?: number
}

function formatNumeric(value: number, decimals: number): string {
  return value.toLocaleString("en-AU", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function parseNumericInput(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, "")
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const parsed = parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Editable numeric input with format-on-blur display.
 *
 * Behaviour:
 * - On initial render and on blur: displays number with fixed decimals (e.g. "6.0000")
 * - On focus: displays raw numeric string for editing (e.g. "6")
 * - On change while focused: stores raw string, defers parsing to blur
 * - On blur: parses raw string, calls onChange with number or null, returns to formatted display
 *
 * Default decimal places is 4 (matches BUY AMOUNT specification). Override via `decimals` prop.
 */
export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(function NumericInput(
  { value, onChange, decimals = 4, className, ...rest },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false)
  const [rawValue, setRawValue] = useState<string>(value != null ? String(value) : "")

  const formattedValue = value != null ? formatNumeric(value, decimals) : ""

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
        const parsed = parseNumericInput(rawValue)
        onChange(parsed ?? null)
        rest.onBlur?.(e)
      }}
      onChange={(e) => {
        setRawValue(e.target.value)
      }}
      className={cn("w-full", className)}
      {...rest}
    />
  )
})

NumericInput.displayName = "NumericInput"
