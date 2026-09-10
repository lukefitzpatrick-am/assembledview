/**
 * ExpertGrid Unit Rate cell display. Idle = formatRate (currency, min 2 / max 4).
 * Focused = raw editable number. Commit parses via parseMoneyInput and does not round.
 */

import {
  formatRate,
  parseMoneyInput,
  type MoneyInput,
} from "@/lib/format/money"

function isEmptyUnitRate(value: MoneyInput): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string" && value.trim() === "") return true
  return false
}

/** Idle currency, or the raw typed/stored number while the cell is focused. */
export function formatUnitRateCellValue(
  value: MoneyInput,
  focused: boolean
): string {
  if (isEmptyUnitRate(value)) return ""
  if (focused) {
    return typeof value === "number" ? String(value) : String(value)
  }
  return formatRate(value)
}

/**
 * Parse a committed Unit Rate keystroke or paste. Empty / whitespace → `""`.
 * Does not round. Returns the parseMoneyInput number.
 */
export function commitUnitRateInput(raw: string): number | "" {
  if (raw.trim() === "") return ""
  const parsed = parseMoneyInput(raw)
  if (parsed === null) return ""
  return parsed
}
