import { coerceDollars, dollarsToCents } from "./money"

/**
 * Project a Xero AR invoice into finance_billing_records money columns.
 * Decision (Luke, 1 Sep 2026): ex-GST everywhere internally. GST is applied
 * only at the invoice boundary. Xero Total is GST-inclusive
 * (total = sub_total + total_tax); we store sub_total.
 */
export function projectXeroArToBillingAmounts(subTotal: unknown): {
  totalDollars: number
  billedAmountCents: number
} {
  const totalDollars = coerceDollars(subTotal)
  return {
    totalDollars,
    billedAmountCents: dollarsToCents(totalDollars),
  }
}
