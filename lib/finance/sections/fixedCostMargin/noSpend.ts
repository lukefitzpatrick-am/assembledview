/**
 * Fixed cost margin: a platform month with billing and no spend recorded
 * (C-185, Luke 10 Nov 2026), behind `fixed_cost_margin_no_spend_yet`.
 *
 * Today a platform-cost line's month with billing and no platform spend rows
 * counts as margin of the whole billed amount (100%). With the switch on:
 * - a month before the current Melbourne month: "Billed, no spend recorded",
 *   margin blank, left out of margin totals and percentages;
 * - a month after it: left out of margin the same way ("Future month, no
 *   spend yet");
 * - the current month: as today (spend still arriving, month to date).
 * Bill-cost lines already leave a month with no counted bill out of margin.
 *
 * Pure: the page, the Excel export and the loader share it.
 */

export const FIXED_COST_MARGIN_NO_SPEND_YET_KEY = "fixed_cost_margin_no_spend_yet" as const

/** "past": before the current month. "future": after it. */
export type NoSpendYet = "past" | "future"

export const NO_SPEND_RECORDED_LABEL = "Billed, no spend recorded"
export const NO_SPEND_FUTURE_LABEL = "Future month, no spend yet"

/** Added to the notes only when a month is tagged. */
export const NO_SPEND_YET_NOTE =
  "Billed, no spend recorded: a platform-cost line's month before the current month (Melbourne) with billing and no platform spend rows. Its margin is blank and it is left out of margin totals and margin %. A later month with billing and no spend is left out the same way (Future month, no spend yet). The current month is month to date and still counts as before. Lines costed from Xero bills already leave a month with no counted bill out of margin."

/**
 * Where a month with billing and no spend recorded sits. Null for the
 * current month (today's rule: still counted, spend still arriving).
 */
export function noSpendYetFor(month: string, currentMonth: string): NoSpendYet | null {
  if (month < currentMonth) return "past"
  if (month > currentMonth) return "future"
  return null
}

export function noSpendYetLabel(kind: NoSpendYet): string {
  return kind === "past" ? NO_SPEND_RECORDED_LABEL : NO_SPEND_FUTURE_LABEL
}
