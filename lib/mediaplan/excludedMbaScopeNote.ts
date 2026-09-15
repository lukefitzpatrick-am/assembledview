/**
 * Honest totals copy when MBA scope omits lines from this version.
 * Channel sheets drop those rows; this note sits under Total Gross Media.
 */

import { formatMoney } from "@/lib/format/money"

export type ExcludedMbaScopeLine = {
  media: number
  approved?: boolean
  flags?: { excluded?: boolean }
}

export function summariseExcludedMbaScope(
  lines: ReadonlyArray<ExcludedMbaScopeLine>,
): { amount: number; lineCount: number } {
  let amount = 0
  let lineCount = 0
  for (const line of lines) {
    const excluded = line.flags?.excluded === true || line.approved === false
    if (!excluded) continue
    lineCount += 1
    amount += line.media
  }
  return { amount, lineCount }
}

/** `null` when every line is in scope — do not print a note. */
export function formatExcludedFromMbaScopeNote(
  amount: number,
  lineCount: number,
): string | null {
  if (lineCount <= 0) return null
  const noun = lineCount === 1 ? "line" : "lines"
  return `Not in this MBA: ${formatMoney(amount)} across ${lineCount} ${noun} (see plan for full schedule)`
}

export function excludedFromMbaScopeNoteFromLines(
  lines: ReadonlyArray<ExcludedMbaScopeLine>,
): string | null {
  const { amount, lineCount } = summariseExcludedMbaScope(lines)
  return formatExcludedFromMbaScopeNote(amount, lineCount)
}
