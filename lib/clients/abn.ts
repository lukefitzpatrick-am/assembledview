/**
 * Australian Business Number (ABN) checks for the client forms.
 *
 * - Spaces and punctuation are stripped before validating.
 * - A saved ABN is exactly 11 digits (blank is allowed).
 * - The ATO mod-89 check digit is a warning only. It never blocks a save.
 *
 * ATO rule: subtract 1 from the first digit, multiply each digit by
 * 10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, add the products, and the total
 * must divide by 89. Example ABN from the ATO: 51 824 753 556.
 *
 * Pure: no DB, no React.
 */

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const

export const ABN_FORMAT_MESSAGE = "ABN must be 11 digits (spaces and punctuation are ignored)"

export const ABN_CHECKSUM_WARNING =
  "This ABN fails the ATO check digit. Check it is typed correctly. You can still save."

/** Strip spaces and punctuation (anything that is not a letter or digit). */
export function normalizeAbn(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).replace(/[^A-Za-z0-9]/g, "")
}

/** True when the normalised value is blank or exactly 11 digits. */
export function isAbnBlankOrElevenDigits(value: string): boolean {
  return value === "" || /^\d{11}$/.test(value)
}

/** True when an 11-digit ABN passes the ATO mod-89 check. */
export function isValidAbnChecksum(value: unknown): boolean {
  const digits = normalizeAbn(value)
  if (!/^\d{11}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 11; i++) {
    const digit = Number(digits[i]) - (i === 0 ? 1 : 0)
    sum += digit * ABN_WEIGHTS[i]!
  }
  return sum % 89 === 0
}

/**
 * Non-blocking warning for the form: only when the value is 11 digits and
 * fails the check digit. Blank or badly formed values get null (the schema
 * reports the format error).
 */
export function abnChecksumWarning(value: unknown): string | null {
  const digits = normalizeAbn(value)
  if (!/^\d{11}$/.test(digits)) return null
  return isValidAbnChecksum(digits) ? null : ABN_CHECKSUM_WARNING
}
