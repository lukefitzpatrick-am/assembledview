/**
 * The Data quality queue's rules (S17). Pure: the server writer, the screen
 * and the digest read the same keys.
 *
 * Every check writes through `recordFindings` in `items.server.ts` (INVARIANTS).
 * A new check adds its rule keys here.
 */
import type { PublishRule } from "@/lib/mediaplan/publishValidation"

/** The publish validation refusals (S1), as queue rules on published versions. */
export const PUBLISH_RULES = [
  "no_publisher",
  "burst_end_before_start",
  "bursts_overlap",
  "burst_outside_plan_dates",
  "plan_dates_reversed",
  "package_no_quantity",
] as const satisfies readonly PublishRule[]

export type DataQualityRuleKey = `publish.${(typeof PUBLISH_RULES)[number]}` | "relabel.drift"
