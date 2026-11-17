import type { BillingMonth } from "@/lib/billing/types"

/**
 * A deep copy of a billing schedule, so an edit never writes into the months
 * it read. Both plan pages use it (B52).
 */
export function cloneBillingMonths(months: BillingMonth[]): BillingMonth[] {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(months) as BillingMonth[]
  }
  return JSON.parse(JSON.stringify(months)) as BillingMonth[]
}
