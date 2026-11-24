/**
 * Delivery-reader switches, read once per request and passed down as plain
 * booleans, so pure readers stay synchronous and testable.
 *
 * - packageNoUnitTarget: `expert_package_quantity` (P14, B23), which requires
 *   `fixed_cost_report_net` (B23fix: the Snowflake report treats package as
 *   time based only on the net basis).
 * - fixedCostReportNet: `fixed_cost_report_net` (FC4, B23): the snapshot sends
 *   net media and Melbourne burst days to the fixed-cost procedure.
 * - fixedCostFromDate: `fixed_cost_from_date` (FC2, B23), which requires
 *   `fixed_cost_report_net`: the date field, the save check, the snapshot
 *   date and the readers' per-day split.
 * - oneNetMedia: `one_net_media` (M1): net media from a fee-inclusive budget
 *   through `computeBurstAmounts` (`netFromGross`).
 *
 * The registry's `requires` is resolved by `isFeatureOn` and the browser
 * snapshot, so each flag is one switch read.
 *
 * All off = every reader acts exactly as before.
 */
import { clientFeatureOn } from "@/lib/features/client"

export type DeliveryFlags = {
  packageNoUnitTarget: boolean
  fixedCostReportNet: boolean
  fixedCostFromDate: boolean
  oneNetMedia: boolean
}

export const DELIVERY_FLAGS_OFF: DeliveryFlags = Object.freeze({
  packageNoUnitTarget: false,
  fixedCostReportNet: false,
  fixedCostFromDate: false,
  oneNetMedia: false,
})

/** Browser read (the root layout's switch snapshot). On the server it is the default (off). */
export function deliveryFlagsFromClient(): DeliveryFlags {
  return {
    packageNoUnitTarget: clientFeatureOn("expert_package_quantity"),
    fixedCostReportNet: clientFeatureOn("fixed_cost_report_net"),
    fixedCostFromDate: clientFeatureOn("fixed_cost_from_date"),
    oneNetMedia: clientFeatureOn("one_net_media"),
  }
}
