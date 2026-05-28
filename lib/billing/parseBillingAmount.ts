/** Same parsing as manual billing commit / EditableLineItemMonthInput. */
export function parseBillingAmountRaw(raw: string): number {
  return parseFloat(String(raw ?? "").replace(/[^0-9.-]/g, "")) || 0
}
