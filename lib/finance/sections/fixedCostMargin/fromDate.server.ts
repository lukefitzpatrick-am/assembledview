/**
 * Server read of the FC9 switch (see ./fromDate.ts). A failed read is off,
 * logged, so the report stays exactly as before.
 */
import "server-only"

import type { FeatureKey } from "@/lib/features/registry"
import { isFeatureOn } from "@/lib/features/server"

type Reader = (key: FeatureKey) => Promise<boolean>

export async function readFixedCostMarginFromDate(read: Reader = (key) => isFeatureOn(key)): Promise<boolean> {
  try {
    return (await read("fixed_cost_margin_from_date")) === true
  } catch (err) {
    console.warn("[fixed-cost-margin] fixed_cost_margin_from_date read failed; off", err)
    return false
  }
}
