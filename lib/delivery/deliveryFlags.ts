/**
 * Delivery-reader switches, read once per request and passed down as plain
 * booleans, so pure readers stay synchronous and testable.
 *
 * - packageNoUnitTarget: `expert_package_quantity` (P14, B23).
 * - fixedCostReportNet: `fixed_cost_report_net` (FC4, B23): the snapshot sends
 *   net media and Melbourne burst days to the fixed-cost procedure.
 * - fixedCostFromDate: `fixed_cost_from_date` AND `fixed_cost_report_net`
 *   (FC2, B23): the date field, the save check, the snapshot date and the
 *   readers' per-day split. The date needs the net basis, so both must be on.
 *
 * All off = every reader acts exactly as before.
 */
import { clientFeatureOn } from "@/lib/features/client"

export type DeliveryFlags = {
  packageNoUnitTarget: boolean
  fixedCostReportNet: boolean
  fixedCostFromDate: boolean
}

export const DELIVERY_FLAGS_OFF: DeliveryFlags = Object.freeze({
  packageNoUnitTarget: false,
  fixedCostReportNet: false,
  fixedCostFromDate: false,
})

/** `fixed_cost_from_date` counts only with `fixed_cost_report_net` on (registry `requires`). */
export function combineFixedCostFromDate(dateOn: boolean, netOn: boolean): boolean {
  return dateOn === true && netOn === true
}

/** Browser read (the root layout's switch snapshot). On the server it is the default (off). */
export function deliveryFlagsFromClient(): DeliveryFlags {
  const fixedCostReportNet = clientFeatureOn("fixed_cost_report_net")
  return {
    packageNoUnitTarget: clientFeatureOn("expert_package_quantity"),
    fixedCostReportNet,
    fixedCostFromDate: combineFixedCostFromDate(clientFeatureOn("fixed_cost_from_date"), fixedCostReportNet),
  }
}
