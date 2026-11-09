/**
 * Server read of the FC9 switch (see ./fromDate.ts). A failed read is off,
 * logged, so the report stays exactly as before.
 */
import "server-only"

import type { FeatureKey } from "@/lib/features/registry"
import { isFeatureOn } from "@/lib/features/server"

import { combineFixedCostMarginFromDate, FIXED_COST_MARGIN_FROM_DATE_KEY } from "./fromDate"

type Reader = (key: FeatureKey) => Promise<boolean>

export async function readFixedCostMarginFromDate(read: Reader = (key) => isFeatureOn(key)): Promise<boolean> {
  try {
    const [marginOn, dateOn, netOn] = await Promise.all([
      read(FIXED_COST_MARGIN_FROM_DATE_KEY),
      read("fixed_cost_from_date"),
      read("fixed_cost_report_net"),
    ])
    return combineFixedCostMarginFromDate(marginOn, dateOn, netOn)
  } catch (err) {
    console.warn("[fixed-cost-margin] fixed_cost_margin_from_date read failed; off", err)
    return false
  }
}
