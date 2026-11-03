/**
 * Server read of the delivery-reader switches (see ./deliveryFlags.ts).
 * A failed read is all off (today's behaviour), logged.
 */
import "server-only"

import { isFeatureOn } from "@/lib/features/server"
import type { FeatureKey } from "@/lib/features/registry"

import { DELIVERY_FLAGS_OFF, type DeliveryFlags } from "./deliveryFlags"

type Reader = (key: FeatureKey) => Promise<boolean>

export async function readDeliveryFlags(read: Reader = (key) => isFeatureOn(key)): Promise<DeliveryFlags> {
  try {
    const packageNoUnitTarget = await read("expert_package_quantity")
    return { packageNoUnitTarget }
  } catch (err) {
    console.warn("[delivery] switch read failed; using defaults (off)", err)
    return { ...DELIVERY_FLAGS_OFF }
  }
}
