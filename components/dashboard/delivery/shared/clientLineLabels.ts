/**
 * Client dashboard wording for line items.
 * Clients never see "fixed cost" on the dashboard (Luke, 26 Oct 2026).
 * Display-only: buy types, flags and pacing maths are unchanged.
 */

/** Spend card / chip title for lines whose spend comes from a reported spend file. */
export const CLIENT_REPORTED_SPEND_LABEL = "Reported spend"

/** True when the text is a fixed-cost buy type ("fixed_cost", "Fixed Cost", "fixed-cost media"). */
export function isFixedCostBuyTypeText(value: string | null | undefined): boolean {
  if (value == null) return false
  const key = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
  return key === "fixed cost" || key === "fixed cost media"
}

/**
 * Text for the small pill beside a line item name. Fixed-cost buy types show no pill
 * (other buy types show their raw value, e.g. "cpm").
 */
export function clientLinePillText(value: string | null | undefined): string | undefined {
  if (value == null) return undefined
  const text = String(value).trim()
  if (!text || isFixedCostBuyTypeText(text)) return undefined
  return text
}
