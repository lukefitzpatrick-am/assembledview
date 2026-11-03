/**
 * Delivery-reader switches, read once per request and passed down as plain
 * booleans, so pure readers stay synchronous and testable.
 *
 * - packageNoUnitTarget: `expert_package_quantity` (P14, B23).
 *
 * All off = every reader acts exactly as before.
 */
import { clientFeatureOn } from "@/lib/features/client"

export type DeliveryFlags = {
  packageNoUnitTarget: boolean
}

export const DELIVERY_FLAGS_OFF: DeliveryFlags = Object.freeze({
  packageNoUnitTarget: false,
})

/** Browser read (the root layout's switch snapshot). On the server it is the default (off). */
export function deliveryFlagsFromClient(): DeliveryFlags {
  return {
    packageNoUnitTarget: clientFeatureOn("expert_package_quantity"),
  }
}
