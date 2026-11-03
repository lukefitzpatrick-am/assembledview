/**
 * Server read of the delivery-reader switches (see ./deliveryFlags.ts).
 * A failed read is all off (today's behaviour), logged.
 */
import "server-only"

import { isFeatureOn } from "@/lib/features/server"
import type { FeatureKey } from "@/lib/features/registry"

import {
  combineFixedCostFromDate,
  combinePackageQuantity,
  DELIVERY_FLAGS_OFF,
  type DeliveryFlags,
} from "./deliveryFlags"

type Reader = (key: FeatureKey) => Promise<boolean>

/**
 * B23fix: `hub_delivered_dedupe`, its own switch (Luke, 3 Nov 2026),
 * independent of the fixed-cost switches. A failed read is off.
 */
export async function readHubDeliveredDedupe(read: Reader = (key) => isFeatureOn(key)): Promise<boolean> {
  try {
    return (await read("hub_delivered_dedupe")) === true
  } catch (err) {
    console.warn("[delivery] hub_delivered_dedupe read failed; off", err)
    return false
  }
}

export async function readDeliveryFlags(read: Reader = (key) => isFeatureOn(key)): Promise<DeliveryFlags> {
  try {
    const [packageOn, fixedCostReportNet, dateOn] = await Promise.all([
      read("expert_package_quantity"),
      read("fixed_cost_report_net"),
      read("fixed_cost_from_date"),
    ])
    return {
      packageNoUnitTarget: combinePackageQuantity(packageOn, fixedCostReportNet),
      fixedCostReportNet,
      fixedCostFromDate: combineFixedCostFromDate(dateOn, fixedCostReportNet),
    }
  } catch (err) {
    console.warn("[delivery] switch read failed; using defaults (off)", err)
    return { ...DELIVERY_FLAGS_OFF }
  }
}
