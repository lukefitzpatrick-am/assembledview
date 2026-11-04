"use client"

/**
 * A number box that shows a formatted value ("15.00%", "$1,000.00") and keeps
 * the text as typed while it has focus (B22fix R1). On focus it shows the
 * plain number, selected, so typing replaces it. Each keystroke sends the
 * value of what is typed. On blur it formats again. A box that isn't typed in
 * never calls onChange, so its value (and the save body) stay as they were.
 * Pure half: lib/clients/typedNumberInput.ts.
 */
import * as React from "react"

import { Input } from "@/components/ui/input"
import {
  parseTypedNumber,
  typedNumberDisplayText,
  typedNumberEditText,
  type TypedNumberEmpty,
} from "@/lib/clients/typedNumberInput"

type BaseInputProps = Omit<React.ComponentProps<"input">, "type" | "value" | "defaultValue" | "onChange" | "ref">

export type TypedNumberInputProps = BaseInputProps & {
  /** The form value: a number, or null / undefined / "" for blank. */
  value: unknown
  /** Called on each keystroke with the value of the typed text (see parseTypedNumber). */
  onChange: (value: number | string | null) => void
  /** Formats the value text for display without focus (the form's formatPercentage or formatCurrency). */
  format: (text: string) => string
  /** What a cleared box holds. */
  empty: TypedNumberEmpty
}

export const TypedNumberInput = React.forwardRef<HTMLInputElement, TypedNumberInputProps>(function TypedNumberInput(
  { value, onChange, format, empty, onFocus, onBlur, ...rest },
  ref,
) {
  // null: not being typed in, show the formatted value.
  const [draft, setDraft] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const selectAfterFocus = React.useRef(false)

  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  // The focus render swaps the formatted text for the plain number, which
  // moves the caret to the end. Select it all so typing replaces it.
  React.useLayoutEffect(() => {
    if (draft === null || !selectAfterFocus.current) return
    selectAfterFocus.current = false
    inputRef.current?.select()
  }, [draft])

  return (
    <Input
      {...rest}
      ref={setRefs}
      type="text"
      value={draft ?? typedNumberDisplayText(value, format)}
      onFocus={(e) => {
        selectAfterFocus.current = true
        setDraft(typedNumberEditText(value))
        onFocus?.(e)
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        onChange(parseTypedNumber(e.target.value, empty))
      }}
      onBlur={(e) => {
        setDraft(null)
        onBlur?.(e)
      }}
    />
  )
})
