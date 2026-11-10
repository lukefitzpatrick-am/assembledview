/**
 * Server read of `fixed_cost_margin_no_spend_yet` (see ./noSpend.ts). A
 * failed read is off, logged, so the report stays exactly as before.
 */
import "server-only"

import type { FeatureKey } from "@/lib/features/registry"
import { isFeatureOn } from "@/lib/features/server"

import { FIXED_COST_MARGIN_NO_SPEND_YET_KEY } from "./noSpend"

type Reader = (key: FeatureKey) => Promise<boolean>

export async function readFixedCostMarginNoSpendYet(read: Reader = (key) => isFeatureOn(key)): Promise<boolean> {
  try {
    return (await read(FIXED_COST_MARGIN_NO_SPEND_YET_KEY)) === true
  } catch (err) {
    console.warn("[fixed-cost-margin] fixed_cost_margin_no_spend_yet read failed; off", err)
    return false
  }
}
