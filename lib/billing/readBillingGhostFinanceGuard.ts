import "server-only"

import { isFeatureOn } from "@/lib/features/server"

/**
 * Switch `billing_ghost_row_finance_guard` (B35, MB-37). A failed read is off
 * (today's behaviour), logged with the caller's tag.
 */
export async function readBillingGhostFinanceGuard(tag: string): Promise<boolean> {
  try {
    return await isFeatureOn("billing_ghost_row_finance_guard")
  } catch (err) {
    console.warn(`[${tag}] billing_ghost_row_finance_guard read failed; treating as off`, err)
    return false
  }
}
