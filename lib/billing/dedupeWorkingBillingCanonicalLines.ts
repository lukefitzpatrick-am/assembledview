/**
 * MB-30 loud guard — collapse duplicate working billing rows that share a
 * canonical line id (bare ↔ billing-{media}::bare). Does **not** close MB-30:
 * distinct canons (e.g. ::supabase001PB1 vs ::new-0) still need upstream fix.
 *
 * Keep the first occurrence (working / override row wins over a later push).
 */

import type { BillingLineItem } from "@/lib/billing/types"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"

export type CanonicalBillingLineCollapse = {
  canonicalId: string
  keptId: string
  droppedIds: string[]
}

export function dedupeBillingLineItemsByCanonicalId(
  items: BillingLineItem[]
): { list: BillingLineItem[]; collapses: CanonicalBillingLineCollapse[] } {
  const seen = new Map<string, BillingLineItem>()
  const collapses: CanonicalBillingLineCollapse[] = []
  const order: string[] = []

  for (const li of items) {
    const raw = String(li.id ?? "").trim()
    if (!raw) {
      const orphanKey = `__orphan_${order.length}`
      seen.set(orphanKey, li)
      order.push(orphanKey)
      continue
    }
    const canon = toBillingOverrideLineItemId(raw)
    const prev = seen.get(canon)
    if (!prev) {
      seen.set(canon, li)
      order.push(canon)
      continue
    }
    const existing = collapses.find((c) => c.canonicalId === canon)
    if (existing) {
      existing.droppedIds.push(raw)
    } else {
      collapses.push({
        canonicalId: canon,
        keptId: String(prev.id ?? ""),
        droppedIds: [raw],
      })
    }
  }

  const list = order.map((k) => seen.get(k)!).filter(Boolean)
  return { list, collapses }
}
