/**
 * Number boxes on the edit client form that show a formatted value when not
 * being typed in ("15.00%", "$1,000.00"): the fees, the retainer, organic
 * social and the ad serving rates (B22fix R1).
 *
 * The old boxes reformatted on every keystroke. React then put the caret
 * after the "%", so typing 1 then 0 gave "1.00%0" and saved 1. Now the box
 * holds the text as typed while it has focus and formats on blur. These
 * helpers are the pure half; `components/clients/TypedNumberInput.tsx` is
 * the box.
 */

/** What a cleared box holds: 0 (the 8 original fees, the money boxes) or null (the 12 fees from 0113). */
export type TypedNumberEmpty = 0 | null

/** The form value as text, as the old boxes read it (`field.value?.toString() || ""`). */
export function typedNumberValueText(value: unknown): string {
  if (value == null) return ""
  return String(value)
}

/**
 * The form value after a keystroke. Digits and dots of the typed text, as a
 * number (10 is 10, 12.5 is 12.5). No digits is `empty`. Text that isn't one
 * number ("1..5") is kept as text, so the schema refuses it and the save
 * says which field to fix, rather than saving something else.
 */
export function parseTypedNumber(text: string, empty: TypedNumberEmpty): number | string | null {
  const numeric = text.replace(/[^0-9.]/g, "")
  if (numeric === "") return empty
  const n = Number(numeric)
  return Number.isFinite(n) ? n : numeric
}

/** True when the value is a number the box can format (a number, or text that is one number). */
export function isFormattableTypedNumber(value: unknown): boolean {
  if (value == null || value === "") return true
  if (typeof value === "number") return true
  if (typeof value !== "string") return false
  const numeric = value.replace(/[^0-9.]/g, "")
  return numeric === "" || Number.isFinite(Number(numeric))
}

/** The text a box shows when it gets focus: the plain number ("15", "17.654"), or "" when blank. */
export function typedNumberEditText(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
  return String(value)
}

/** What the box shows without focus: the formatted value, or the raw text when it isn't one number. */
export function typedNumberDisplayText(value: unknown, format: (text: string) => string): string {
  const text = typedNumberValueText(value)
  return isFormattableTypedNumber(value) ? format(text) : text
}
