import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"
import { billingOverrideLineIdsMatch } from "@/lib/finance/manualBillingOverridesUi"

/**
 * Resolve a line's month amount from the manual-billing draft.
 * Matches bare persisted ids (`supabase001PB1`) to decorated scope ids
 * (`billing-progBvod::supabase001PB1`). When both a $0 inject duplicate and a
 * hydrated row match, prefer the row with the larger absolute month amount.
 */
export function resolveManualBillingLineItemAmount(
  months: BillingMonth[],
  mediaKey: string,
  lineItemId: string,
  monthYear: string
): number {
  const list = months[0]?.lineItems?.[
    mediaKey as keyof NonNullable<BillingMonth["lineItems"]>
  ] as BillingLineItem[] | undefined
  if (!list?.length) return 0

  let best: number | undefined
  for (const li of list) {
    if (!billingOverrideLineIdsMatch(String(li.id ?? ""), lineItemId)) continue
    const amount = li.monthlyAmounts?.[monthYear] ?? 0
    if (best === undefined || Math.abs(amount) > Math.abs(best)) {
      best = amount
    }
  }
  return best ?? 0
}
